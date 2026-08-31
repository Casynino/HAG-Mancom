'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, ne, sql } from 'drizzle-orm'
import type { Database } from '@/db/client'
import { configChangeLog } from '@/db/schema'
import { recordAudit } from '@/lib/audit'
import { asActorWith, type Actor } from '@/lib/authz/guard'
import {
  actionError,
  ConflictError,
  NotFoundError,
  ValidationError,
  type ActionResult,
} from '@/lib/errors'
import {
  approvalPolicySchema,
  bankAccountSchema,
  chargeRuleSchema,
  configDecisionSchema,
  CONFIG_TABLES,
  fieldErrorsFrom,
  legalEntitySchema,
  numberingRuleSchema,
  roundingPolicySchema,
  taxRuleSchema,
} from '@/lib/validation/schemas'

/**
 * Company configuration — Section E.
 *
 * The single rule this module exists to enforce: a value observed in a
 * historical document is inert until a human approves it. Everything arrives as
 * a draft, an Administrator reviews it, and the promotion is written to
 * `config_change_log` and the audit trail in the same transaction as the state
 * change.
 *
 * Approving a record supersedes the previously approved one for the same slot
 * rather than deleting it, so the platform can always answer "what was the
 * approved VAT rate in March".
 */

type ConfigTable = (typeof CONFIG_TABLES)[number]

/**
 * Which columns identify "the same setting" for supersession. Approving a new
 * VAT rate must retire the old one; approving a second bank account for a
 * different currency must not.
 */
const SUPERSEDE_KEYS: Record<ConfigTable, string[]> = {
  legal_entities: [],
  entity_addresses: [],
  bank_accounts: ['legal_entity_id', 'currency'],
  numbering_rules: ['document_type'],
  charge_rules: ['code'],
  tax_rules: ['code'],
  rounding_policies: ['scope', 'currency'],
  brand_profiles: [],
  approval_policies: ['document_type'],
  client_vendor_identities: ['client_id'],
}

const TABLE_LABELS: Record<ConfigTable, string> = {
  legal_entities: 'Legal entity',
  entity_addresses: 'Address',
  bank_accounts: 'Bank account',
  numbering_rules: 'Numbering rule',
  charge_rules: 'Charge',
  tax_rules: 'Tax rate',
  rounding_policies: 'Rounding policy',
  brand_profiles: 'Brand Profile',
  approval_policies: 'Approval policy',
  client_vendor_identities: 'Client vendor identity',
}

async function writeConfigChange(
  db: Database,
  actor: Actor,
  table: ConfigTable,
  id: string,
  fromState: string | null,
  toState: string,
  comment: string | null,
) {
  await db.insert(configChangeLog).values({
    entityTable: table,
    entityId: id,
    fromState: fromState as never,
    toState: toState as never,
    actorId: actor.id,
    comment,
  })
}

/**
 * Approve or reject a configuration record.
 *
 * The table name is validated against a fixed allow-list before it reaches a
 * query, so nothing user-supplied is ever interpolated as an identifier.
 */
export async function decideConfigAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const parsed = configDecisionSchema.safeParse({
      table: formData.get('table'),
      id: formData.get('id'),
      decision: formData.get('decision'),
      comment: formData.get('comment') ?? undefined,
    })
    if (!parsed.success) {
      throw new ValidationError('Check the details below.', fieldErrorsFrom(parsed.error))
    }

    const { table, id, decision, comment } = parsed.data

    if (decision === 'reject' && !comment) {
      throw new ValidationError('Say why you are rejecting this.', {
        comment: ['A reason is required when rejecting.'],
      })
    }

    await asActorWith('config.approve', async (db, actor) => {
      const identifier = sql.identifier(table)

      const existing = await db.execute(
        sql`select id, state from public.${identifier} where id = ${id}::uuid`,
      )
      const row = existing.rows[0] as { id: string; state: string } | undefined
      if (!row) throw new NotFoundError('That setting no longer exists.')

      if (row.state === 'approved' && decision === 'approve') {
        throw new ConflictError('That setting is already approved.')
      }
      if (row.state === 'superseded') {
        throw new ConflictError('That version has been superseded and cannot be changed.')
      }

      if (decision === 'approve') {
        // Retire whatever currently occupies this slot. Superseded rather than
        // deleted, so the history of what was approved when survives.
        const keys = SUPERSEDE_KEYS[table]
        if (keys.length > 0) {
          const match = keys
            .map((k) => sql`t.${sql.identifier(k)} = source.${sql.identifier(k)}`)
            .reduce((a, b) => sql`${a} and ${b}`)

          await db.execute(sql`
            update public.${identifier} t
               set state = 'superseded'
              from (select * from public.${identifier} where id = ${id}::uuid) source
             where t.state = 'approved' and t.id <> ${id}::uuid and ${match}
          `)
        } else if (table === 'brand_profiles') {
          // Only one Brand Profile may be approved at a time.
          await db.execute(sql`
            update public.brand_profiles set state = 'superseded'
             where state = 'approved' and id <> ${id}::uuid
          `)
        }

        await db.execute(sql`
          update public.${identifier}
             set state = 'approved', approved_by = ${actor.id}::uuid, approved_at = now()
           where id = ${id}::uuid
        `)
      } else {
        await db.execute(sql`
          update public.${identifier} set state = 'rejected' where id = ${id}::uuid
        `)
      }

      await writeConfigChange(
        db,
        actor,
        table,
        id,
        row.state,
        decision === 'approve' ? 'approved' : 'rejected',
        comment ?? null,
      )

      await recordAudit(db, actor, {
        action: decision === 'approve' ? 'config.approved' : 'config.rejected',
        entityType: table,
        entityId: id,
        metadata: { previousState: row.state, comment: comment ?? null },
      })
    })

    revalidatePath('/admin/settings')
    return {
      ok: true,
      data: null,
      message:
        decision === 'approve'
          ? `${TABLE_LABELS[table]} approved and now in effect.`
          : `${TABLE_LABELS[table]} rejected.`,
    }
  } catch (err) {
    return actionError(err)
  }
}

/** Creates a new draft of a configuration record. Never writes an approved row. */
export async function createConfigDraftAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const table = String(formData.get('table') ?? '') as ConfigTable
    if (!CONFIG_TABLES.includes(table)) throw new NotFoundError('Unknown setting.')

    const id = await asActorWith('config.manage', async (db, actor) => {
      const created = await insertDraft(db, actor, table, formData)

      await writeConfigChange(db, actor, table, created, null, 'draft', null)
      await recordAudit(db, actor, {
        action: 'config.created',
        entityType: table,
        entityId: created,
      })

      return created
    })

    revalidatePath('/admin/settings')
    return {
      ok: true,
      data: { id },
      message: `${TABLE_LABELS[table]} saved as a draft. Approve it to bring it into effect.`,
    }
  } catch (err) {
    return actionError(err)
  }
}

async function insertDraft(
  db: Database,
  actor: Actor,
  table: ConfigTable,
  formData: FormData,
): Promise<string> {
  const bool = (name: string) => formData.get(name) === 'on' || formData.get(name) === 'true'

  switch (table) {
    case 'legal_entities': {
      const v = legalEntitySchema.safeParse(Object.fromEntries(formData))
      if (!v.success) throw new ValidationError('Check the details below.', fieldErrorsFrom(v.error))
      const r = await db.execute(sql`
        insert into public.legal_entities
          (name, entity_suffix, country_code, registration_number, tin, vrn,
           business_licence, import_export_licence, state, notes, created_by)
        values (${v.data.name}, ${v.data.entitySuffix ?? null}, ${v.data.countryCode},
                ${v.data.registrationNumber ?? null}, ${v.data.tin ?? null}, ${v.data.vrn ?? null},
                ${v.data.businessLicence ?? null}, ${v.data.importExportLicence ?? null},
                'draft', ${v.data.notes ?? null}, ${actor.id}::uuid)
        returning id`)
      return (r.rows[0] as { id: string }).id
    }

    case 'bank_accounts': {
      const v = bankAccountSchema.safeParse(Object.fromEntries(formData))
      if (!v.success) throw new ValidationError('Check the details below.', fieldErrorsFrom(v.error))
      const r = await db.execute(sql`
        insert into public.bank_accounts
          (legal_entity_id, currency, account_name, bank_name, branch, branch_code,
           account_number, swift_code, sort_code, state, notes, created_by)
        values (${v.data.legalEntityId}::uuid, ${v.data.currency.toUpperCase()},
                ${v.data.accountName}, ${v.data.bankName}, ${v.data.branch ?? null},
                ${v.data.branchCode ?? null}, ${v.data.accountNumber}, ${v.data.swiftCode ?? null},
                ${v.data.sortCode ?? null}, 'draft', ${v.data.notes ?? null}, ${actor.id}::uuid)
        returning id`)
      return (r.rows[0] as { id: string }).id
    }

    case 'numbering_rules': {
      const v = numberingRuleSchema.safeParse(Object.fromEntries(formData))
      if (!v.success) throw new ValidationError('Check the details below.', fieldErrorsFrom(v.error))
      const r = await db.execute(sql`
        insert into public.numbering_rules
          (document_type, pattern, prefix, sequence_padding, sequence_start,
           reset_period, state, notes, created_by)
        values (${v.data.documentType}::public.document_type, ${v.data.pattern}, ${v.data.prefix},
                ${v.data.sequencePadding}, ${v.data.sequenceStart},
                ${v.data.resetPeriod}::public.numbering_reset, 'draft',
                ${v.data.notes ?? null}, ${actor.id}::uuid)
        returning id`)
      return (r.rows[0] as { id: string }).id
    }

    case 'charge_rules': {
      const v = chargeRuleSchema.safeParse(Object.fromEntries(formData))
      if (!v.success) throw new ValidationError('Check the details below.', fieldErrorsFrom(v.error))
      const docType = v.data.documentType || null
      const r = await db.execute(sql`
        insert into public.charge_rules
          (code, label, rate_percent, document_type, position, applies_before_vat,
           state, notes, created_by)
        values (${v.data.code}, ${v.data.label}, ${v.data.ratePercent},
                ${docType}::public.document_type, ${v.data.position},
                ${bool('appliesBeforeVat')}, 'draft', ${v.data.notes ?? null}, ${actor.id}::uuid)
        returning id`)
      return (r.rows[0] as { id: string }).id
    }

    case 'tax_rules': {
      const v = taxRuleSchema.safeParse(Object.fromEntries(formData))
      if (!v.success) throw new ValidationError('Check the details below.', fieldErrorsFrom(v.error))
      const docType = v.data.documentType || null
      const r = await db.execute(sql`
        insert into public.tax_rules
          (code, label, rate_percent, document_type, state, notes, created_by)
        values (${v.data.code}, ${v.data.label}, ${v.data.ratePercent},
                ${docType}::public.document_type, 'draft',
                ${v.data.notes ?? null}, ${actor.id}::uuid)
        returning id`)
      return (r.rows[0] as { id: string }).id
    }

    case 'rounding_policies': {
      const v = roundingPolicySchema.safeParse(Object.fromEntries(formData))
      if (!v.success) throw new ValidationError('Check the details below.', fieldErrorsFrom(v.error))
      const r = await db.execute(sql`
        insert into public.rounding_policies
          (scope, currency, decimal_places, mode, round_at_step, state, notes, created_by)
        values (${v.data.scope}, ${v.data.currency.toUpperCase()}, ${v.data.decimalPlaces},
                ${v.data.mode}::public.rounding_mode, ${v.data.roundAtStep}::public.rounding_step,
                'draft', ${v.data.notes ?? null}, ${actor.id}::uuid)
        returning id`)
      return (r.rows[0] as { id: string }).id
    }

    case 'approval_policies': {
      const v = approvalPolicySchema.safeParse(Object.fromEntries(formData))
      if (!v.success) throw new ValidationError('Check the details below.', fieldErrorsFrom(v.error))

      // Delegation is meaningless without also standing down the Director
      // requirement, and allowing both would make the effective rule ambiguous.
      if (bool('technicalOfficerMayApprove') && bool('requiresDirectorApproval')) {
        throw new ValidationError('Choose one approver.', {
          technicalOfficerMayApprove: [
            'A document cannot both require Director approval and be delegated. ' +
              'Turn off the Director requirement to delegate this document type.',
          ],
        })
      }

      const r = await db.execute(sql`
        insert into public.approval_policies
          (document_type, requires_director_approval, technical_officer_may_approve,
           delegation_urgent_only, delegation_max_value, delegation_currency,
           requires_signature, requires_stamp, state, notes, created_by)
        values (${v.data.documentType}::public.document_type,
                ${bool('requiresDirectorApproval')}, ${bool('technicalOfficerMayApprove')},
                ${bool('delegationUrgentOnly')},
                ${v.data.delegationMaxValue ?? null}, ${v.data.delegationCurrency.toUpperCase()},
                ${bool('requiresSignature')}, ${bool('requiresStamp')},
                'draft', ${v.data.notes ?? null}, ${actor.id}::uuid)
        returning id`)
      return (r.rows[0] as { id: string }).id
    }

    default:
      throw new ValidationError(
        `${TABLE_LABELS[table]} records cannot be created from this screen yet.`,
      )
  }
}

/** Marks an approved setting as no longer in effect without approving a replacement. */
export async function withdrawConfigAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const table = String(formData.get('table') ?? '') as ConfigTable
    const id = String(formData.get('id') ?? '')
    const reason = String(formData.get('reason') ?? '').trim()

    if (!CONFIG_TABLES.includes(table)) throw new NotFoundError('Unknown setting.')
    if (reason.length < 5) {
      throw new ValidationError('Say why you are withdrawing this.', {
        reason: ['Give a reason of at least 5 characters.'],
      })
    }

    await asActorWith('config.approve', async (db, actor) => {
      const identifier = sql.identifier(table)
      const r = await db.execute(
        sql`update public.${identifier} set state = 'superseded'
            where id = ${id}::uuid and state = 'approved' returning id`,
      )
      if (r.rows.length === 0) {
        throw new ConflictError('That setting is not currently in effect.')
      }

      await writeConfigChange(db, actor, table, id, 'approved', 'superseded', reason)
      await recordAudit(db, actor, {
        action: 'config.updated',
        entityType: table,
        entityId: id,
        metadata: { withdrawn: true, reason },
      })
    })

    revalidatePath('/admin/settings')
    return { ok: true, data: null, message: 'Withdrawn. It is no longer in effect.' }
  } catch (err) {
    return actionError(err)
  }
}

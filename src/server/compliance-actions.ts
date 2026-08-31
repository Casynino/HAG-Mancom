'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, isNull, sql } from 'drizzle-orm'
import type { Database } from '@/db/client'
import { complianceAlerts, complianceRecords, complianceTypes, userRoles } from '@/db/schema'
import { notifyMany, recordAudit } from '@/lib/audit'
import { asActorWith, type Actor } from '@/lib/authz/guard'
import { actionError, NotFoundError, ValidationError, type ActionResult } from '@/lib/errors'
import { checksum, getStorage } from '@/lib/storage'
import { checkFile, sanitiseFilename } from '@/lib/storage/limits'
import {
  complianceRecordSchema,
  complianceTypeSchema,
  fieldErrorsFrom,
} from '@/lib/validation/document-schemas'

/**
 * Compliance — Stage 8.
 *
 * Status is never stored; `app.compliance_status()` computes it from the expiry
 * date at read time. The only thing persisted is which reminders have already
 * been sent, so a sweep can run as often as it likes without spamming anyone.
 */

export async function createComplianceTypeAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = complianceTypeSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) {
      throw new ValidationError('Check the details below.', fieldErrorsFrom(parsed.error))
    }
    const v = parsed.data

    const id = await asActorWith('config.manage', async (db, actor) => {
      const [created] = await db
        .insert(complianceTypes)
        .values({
          code: v.code,
          label: v.label,
          authority: v.authority ?? null,
          description: v.description ?? null,
          defaultValidityMonths: v.defaultValidityMonths ?? null,
          reminderDays: v.reminderDays,
          createdBy: actor.id,
        })
        .returning({ id: complianceTypes.id })

      await recordAudit(db, actor, {
        action: 'compliance.type_created',
        entityType: 'compliance_types',
        entityId: created!.id,
        metadata: { code: v.code, label: v.label },
      })

      return created!.id
    })

    revalidatePath('/compliance')
    return { ok: true, data: { id }, message: `${v.label} added.` }
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
      return {
        ok: false,
        error: 'That code is already in use.',
        code: 'duplicate',
        fieldErrors: { code: ['Choose a code that is not already used.'] },
      }
    }
    return actionError(err)
  }
}

/**
 * Records a certificate.
 *
 * Recording a new one for a type that already has a live record supersedes the
 * old one rather than replacing it — proving cover on a past date is exactly
 * the kind of thing a regulator asks for.
 */
export async function recordComplianceAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = complianceRecordSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) {
      throw new ValidationError('Check the details below.', fieldErrorsFrom(parsed.error))
    }
    const v = parsed.data

    const file = formData.get('certificate')
    const hasFile = file instanceof File && file.size > 0

    const id = await asActorWith('compliance.manage', async (db, actor) => {
      let stored: {
        storageKey: string
        filename: string
        contentType: string
        byteSize: number
        checksumSha256: string
      } | null = null

      if (hasFile) {
        const f = file as File
        const buffer = Buffer.from(await f.arrayBuffer())
        const verdict = checkFile({
          kind: 'document',
          filename: f.name,
          contentType: f.type,
          byteSize: buffer.byteLength,
          head: new Uint8Array(buffer.subarray(0, 32)),
        })
        if (!verdict.ok) {
          throw new ValidationError(verdict.reason, { certificate: [verdict.reason] })
        }

        const extension = sanitiseFilename(f.name).match(/\.[a-z0-9]{1,9}$/i)?.[0] ?? ''
        const key = `compliance/${v.complianceTypeId}/${crypto.randomUUID()}${extension.toLowerCase()}`
        await getStorage().put(key, buffer, f.type)
        stored = {
          storageKey: key,
          filename: sanitiseFilename(f.name),
          contentType: f.type,
          byteSize: buffer.byteLength,
          checksumSha256: checksum(buffer),
        }
      }

      try {
        // Supersede the current record for this type, if there is one.
        const [existing] = await db
          .select({ id: complianceRecords.id })
          .from(complianceRecords)
          .where(
            and(
              eq(complianceRecords.complianceTypeId, v.complianceTypeId),
              isNull(complianceRecords.supersededAt),
            ),
          )
          .limit(1)

        if (existing) {
          await db
            .update(complianceRecords)
            .set({ supersededAt: new Date() })
            .where(eq(complianceRecords.id, existing.id))
        }

        const [created] = await db
          .insert(complianceRecords)
          .values({
            complianceTypeId: v.complianceTypeId,
            referenceNumber: v.referenceNumber ?? null,
            issuedOn: v.issuedOn || null,
            expiresOn: v.expiresOn,
            responsibleUserId: v.responsibleUserId ?? null,
            notes: v.notes ?? null,
            documentStorageKey: stored?.storageKey ?? null,
            documentFilename: stored?.filename ?? null,
            documentContentType: stored?.contentType ?? null,
            documentByteSize: stored?.byteSize ?? null,
            documentChecksumSha256: stored?.checksumSha256 ?? null,
            createdBy: actor.id,
          })
          .returning({ id: complianceRecords.id })

        if (existing) {
          await db
            .update(complianceRecords)
            .set({ supersededById: created!.id })
            .where(eq(complianceRecords.id, existing.id))
        }

        await recordAudit(db, actor, {
          action: existing ? 'compliance.renewed' : 'compliance.recorded',
          entityType: 'compliance_records',
          entityId: created!.id,
          metadata: {
            complianceTypeId: v.complianceTypeId,
            expiresOn: v.expiresOn,
            supersededId: existing?.id ?? null,
          },
        })

        return created!.id
      } catch (err) {
        if (stored)
          await getStorage()
            .remove(stored.storageKey)
            .catch(() => undefined)
        throw err
      }
    })

    revalidatePath('/compliance')
    return { ok: true, data: { id }, message: 'Certificate recorded.' }
  } catch (err) {
    return actionError(err)
  }
}

export interface ComplianceRow {
  id: string
  code: string
  label: string
  authority: string | null
  referenceNumber: string | null
  issuedOn: string | null
  expiresOn: string | null
  status: string
  daysRemaining: number | null
  responsibleName: string | null
  hasDocument: boolean
}

/** Reads every live certificate with its computed status. */
export async function loadComplianceOverview(db: Database): Promise<ComplianceRow[]> {
  const result = await db.execute(sql`
    select
      cr.id,
      ct.code,
      ct.label,
      ct.authority,
      cr.reference_number,
      cr.issued_on,
      cr.expires_on,
      app.compliance_status(cr.expires_on, cr.renewal_started_on) as status,
      app.compliance_days_remaining(cr.expires_on) as days_remaining,
      p.full_name as responsible_name,
      (cr.document_storage_key is not null) as has_document
    from public.compliance_types ct
    left join public.compliance_records cr
      on cr.compliance_type_id = ct.id and cr.superseded_at is null
    left join public.profiles p on p.id = cr.responsible_user_id
    where ct.is_active = true
    order by
      case app.compliance_status(cr.expires_on, cr.renewal_started_on)
        when 'expired' then 0
        when 'renewal_pending' then 1
        when 'expiring_soon' then 2
        when 'unknown' then 3
        else 4
      end,
      ct.sort_order
  `)

  return (result.rows as Array<Record<string, unknown>>).map((r) => ({
    id: (r.id as string) ?? '',
    code: r.code as string,
    label: r.label as string,
    authority: (r.authority as string) ?? null,
    referenceNumber: (r.reference_number as string) ?? null,
    issuedOn: (r.issued_on as string) ?? null,
    expiresOn: (r.expires_on as string) ?? null,
    status: (r.status as string) ?? 'unknown',
    daysRemaining: r.days_remaining == null ? null : Number(r.days_remaining),
    responsibleName: (r.responsible_name as string) ?? null,
    hasDocument: Boolean(r.has_document),
  }))
}

/**
 * Sends any reminder that is now due and has not been sent.
 *
 * Idempotent: the unique index on (record, expiry, threshold) means running
 * this twice in a day sends nothing the second time. Safe to call from a cron
 * job, a dashboard load, or by hand.
 */
export async function runComplianceRemindersAction(): Promise<
  ActionResult<{ sent: number; checked: number }>
> {
  try {
    const result = await asActorWith('compliance.view', async (db, actor) => {
      const due = await db.execute(sql`
        select
          cr.id,
          cr.expires_on,
          cr.responsible_user_id,
          ct.label,
          ct.reminder_days,
          app.compliance_days_remaining(cr.expires_on) as days_remaining,
          app.compliance_status(cr.expires_on, cr.renewal_started_on) as status
        from public.compliance_records cr
        join public.compliance_types ct on ct.id = cr.compliance_type_id
        where cr.superseded_at is null
          and cr.expires_on is not null
          and ct.is_active = true
      `)

      const rows = due.rows as Array<{
        id: string
        expires_on: string
        responsible_user_id: string | null
        label: string
        reminder_days: string
        days_remaining: number
        status: string
      }>

      let sent = 0

      for (const row of rows) {
        const remaining = Number(row.days_remaining)
        const thresholds = row.reminder_days
          .split(',')
          .map((d) => Number(d.trim()))
          .filter((d) => Number.isFinite(d))

        // The first threshold this record has now crossed. Past expiry, the
        // reminder repeats daily, so the threshold is the day count itself.
        const crossed =
          remaining < 0
            ? remaining
            : thresholds.filter((t) => remaining <= t).sort((a, b) => a - b)[0]

        if (crossed === undefined) continue

        const already = await db
          .select({ id: complianceAlerts.id })
          .from(complianceAlerts)
          .where(
            and(
              eq(complianceAlerts.complianceRecordId, row.id),
              eq(complianceAlerts.expiresOn, row.expires_on),
              eq(complianceAlerts.thresholdDays, crossed),
            ),
          )
          .limit(1)

        if (already.length > 0) continue

        const officers = await db
          .select({ userId: userRoles.userId })
          .from(userRoles)
          .where(
            and(
              isNull(userRoles.revokedAt),
              sql`${userRoles.role} in ('technical_officer','administrator','director')`,
            ),
          )

        const recipients = new Set(officers.map((o) => o.userId))
        if (row.responsible_user_id) recipients.add(row.responsible_user_id)

        const expired = remaining < 0
        const count = await notifyMany(db, null, [...recipients], {
          kind: expired ? 'compliance_expired' : 'compliance_expiring',
          title: expired
            ? `${row.label} expired ${Math.abs(remaining)} day(s) ago`
            : `${row.label} expires in ${remaining} day(s)`,
          body: `Expiry ${row.expires_on}. Renew it and record the new certificate.`,
          entityType: 'compliance_records',
          entityId: row.id,
          href: '/compliance',
        })

        await db.insert(complianceAlerts).values({
          complianceRecordId: row.id,
          thresholdDays: crossed,
          expiresOn: row.expires_on,
          recipientCount: count,
        })

        await recordAudit(db, actor, {
          action: 'compliance.alert_sent',
          entityType: 'compliance_records',
          entityId: row.id,
          metadata: { thresholdDays: crossed, daysRemaining: remaining, recipients: count },
        })

        sent += 1
      }

      return { sent, checked: rows.length }
    })

    revalidatePath('/compliance')
    return {
      ok: true,
      data: result,
      message:
        result.sent === 0
          ? `Checked ${result.checked} certificate(s). No new reminders were due.`
          : `Checked ${result.checked} certificate(s) and sent ${result.sent} reminder(s).`,
    }
  } catch (err) {
    return actionError(err)
  }
}

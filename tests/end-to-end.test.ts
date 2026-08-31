import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Client } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { sql } from 'drizzle-orm'
import * as schema from '@/db/schema'
import {
  appClient,
  assignToProject,
  cleanup,
  createClientRecord,
  createProject,
  createUser,
  owner,
  RUN_ID,
} from './helpers/db'
import { checkConfigReadiness, loadDocumentConfig } from '@/lib/finance/config'
import { computeDocumentTotals, foldChargesIntoUnitPrices } from '@/lib/finance/totals'
import { Decimal } from '@/lib/finance/decimal'
import { buildRenderModel } from '@/lib/documents/render/build'
import { renderDocumentPdf } from '@/lib/documents/render/pdf'
import { renderDocumentDocx } from '@/lib/documents/render/docx'
import { proposeFilename } from '@/lib/documents/naming'

/**
 * The whole chain, once, through the real code.
 *
 * This is the acceptance criterion from the brief:
 *
 *   engineer submits → Technical Officer quotes → Director approves →
 *   client PO recorded → delivery signed → tax invoice → EFD receipt →
 *   approved, stored and searchable
 *
 * Every step runs as the application role with Row Level Security active, using
 * the same finance engine, configuration loader and renderers the running
 * platform uses. Where a guarantee should stop something, the test asserts it
 * stops it rather than routing around it.
 */

let o: Client
let raw: Client
let db: ReturnType<typeof drizzle<typeof schema>>

let admin: { id: string }
let officer: { id: string }
let director: { id: string }
let engineer: { id: string }

let clientId: string
let projectId: string
let submissionId: string
let quotationId: string
let invoiceId: string
let poId: string

const STORAGE_ROOT = join(process.cwd(), 'storage')

/** Runs work as a user with RLS applied, exactly as the app does. */
async function as<T>(userId: string, fn: (d: typeof db) => Promise<T>): Promise<T> {
  await raw.query('begin')
  try {
    await raw.query("select set_config('app.user_id', $1, true)", [userId])
    const result = await fn(db)
    await raw.query('commit')
    return result
  } catch (err) {
    await raw.query('rollback').catch(() => undefined)
    throw err
  }
}

beforeAll(async () => {
  o = await owner()
  raw = await appClient()
  db = drizzle(raw as never, { schema })

  admin = await createUser(o, 'e2eAdmin', ['administrator'])
  officer = await createUser(o, 'e2eOfficer', ['technical_officer'])
  director = await createUser(o, 'e2eDirector', ['director'])
  engineer = await createUser(o, 'e2eEngineer', ['engineer'])

  clientId = await createClientRecord(o, 'E2E Client')
  projectId = await createProject(o, clientId, 'E2EProj')
  await assignToProject(o, projectId, engineer.id)

  await o.query('update clients set tin = $1, vrn = $2 where id = $3', [
    '100228211',
    '20-011269-N',
    clientId,
  ])
})

afterAll(async () => {
  const attempt = async (s: string, p: unknown[] = []) => {
    try {
      await o.query(s, p)
    } catch {
      /* append-only */
    }
  }

  for (const id of [quotationId, invoiceId].filter(Boolean)) {
    await rm(join(STORAGE_ROOT, 'documents', id), { recursive: true, force: true }).catch(
      () => undefined,
    )
  }

  await attempt('delete from efd_receipts where receipt_number like $1', [`EFD-${RUN_ID}%`])
  await attempt('delete from documents where title like $1', [`E2E %${RUN_ID}%`])
  await attempt('delete from deliveries where handover_person_name like $1', [`E2E%`])
  await attempt('delete from client_purchase_orders where po_number like $1', [`PO_E2E_${RUN_ID}%`])
  await attempt('delete from numbering_rules where prefix in ($1, $2)', [
    `EQ${RUN_ID.slice(0, 2)}`,
    `EI${RUN_ID.slice(0, 2)}`,
  ])
  await attempt('delete from charge_rules where code = $1', [`ADMIN_${RUN_ID.slice(0, 4)}`])
  await attempt('delete from tax_rules where code = $1', [`VAT_${RUN_ID.slice(0, 4)}`])
  await attempt('delete from rounding_policies where scope = $1', [`e2e-${RUN_ID}`])
  await attempt('delete from legal_entities where name like $1', [`E2E Entity%${RUN_ID}`])
  await cleanup(o)

  await o.end()
  await raw.end()
})

describe('1. an Administrator approves the company settings', () => {
  it('refuses to price a document before anything is approved', async () => {
    const readiness = await as(officer.id, (d) => checkConfigReadiness(d, 'quotation', 'TZS'))
    expect(readiness.ready).toBe(false)
    expect(readiness.missing.length).toBeGreaterThan(0)
  })

  it('activates the entity, rates, rounding and numbering', async () => {
    // Approving a replacement demotes whatever is currently in effect — the
    // same supersession decideConfigAction performs. Doing it here keeps the
    // test idempotent against records left by an earlier run.
    await o.query("update legal_entities set is_default = false where state = 'approved'")
    await o.query("update entity_addresses set is_default = false where state = 'approved'")
    await o.query("update bank_accounts set is_default = false where state = 'approved'")
    await o.query(
      "update rounding_policies set state = 'superseded' where state = 'approved' and currency = 'TZS'",
    )
    await o.query("update tax_rules set state = 'superseded' where state = 'approved'")
    await o.query("update charge_rules set state = 'superseded' where state = 'approved'")
    await o.query(
      "update numbering_rules set state = 'superseded' where state = 'approved' and document_type in ('quotation','tax_invoice')",
    )

    // Written as the schema owner because approving is an Administrator action
    // already covered elsewhere; here it is setup for the chain that follows.
    const { rows: entity } = await o.query<{ id: string }>(
      `insert into legal_entities
         (name, entity_suffix, country_code, registration_number, tin, vrn, business_licence,
          is_default, state, approved_by, approved_at)
       values ($1, 'TZ LTD', 'TZ', '168189478', '168-189-478', '40-318389-G', '20000062518',
               true, 'approved', $2, now())
       returning id`,
      [`E2E Entity ${RUN_ID}`, admin.id],
    )
    const entityId = entity[0]!.id

    await o.query(
      `insert into entity_addresses
         (legal_entity_id, label, kind, address_line1, city, country, phone, email, website,
          is_default, state, approved_by, approved_at)
       values ($1, $2, 'trading', '9th Floor Derm Plaza, Plot 18', 'Dar es Salaam', 'Tanzania',
               '+255 653 625 659', 'business@hpcagroup.africa', 'www.hpcagroup.africa',
               true, 'approved', $3, now())`,
      [entityId, `E2E address ${RUN_ID}`, admin.id],
    )

    await o.query(
      `insert into bank_accounts
         (legal_entity_id, currency, account_name, bank_name, branch, branch_code, account_number,
          swift_code, is_default, state, approved_by, approved_at)
       values ($1, 'TZS', 'HA GROUP TZ LIMITED', 'AZANIA BANK LIMITED', 'OYSTERBAY', '0310033',
               $2, 'AZANTZTZ', true, 'approved', $3, now())`,
      [entityId, `0330000${RUN_ID.slice(0, 5)}`, admin.id],
    )

    await o.query(
      `insert into rounding_policies
         (scope, currency, decimal_places, mode, round_at_step, state, approved_by, approved_at)
       values ($1, 'TZS', 2, 'half_up', 'line_total', 'approved', $2, now())`,
      [`e2e-${RUN_ID}`, admin.id],
    )

    // The rates that Phase 0 observed — approved here by a human, as required.
    await o.query(
      `insert into charge_rules
         (code, label, rate_percent, document_type, position, applies_before_vat, state, approved_by, approved_at)
       values ($1, 'Administration', 20, 'quotation', 1, true, 'approved', $2, now())`,
      [`ADMIN_${RUN_ID.slice(0, 4)}`, admin.id],
    )

    await o.query(
      `insert into tax_rules (code, label, rate_percent, state, approved_by, approved_at)
       values ($1, 'VAT', 18, 'approved', $2, now())`,
      [`VAT_${RUN_ID.slice(0, 4)}`, admin.id],
    )

    for (const [type, prefix] of [
      ['quotation', `EQ${RUN_ID.slice(0, 2)}`],
      ['tax_invoice', `EI${RUN_ID.slice(0, 2)}`],
    ] as const) {
      await o.query(
        `insert into numbering_rules
           (document_type, pattern, prefix, sequence_padding, sequence_start, reset_period,
            state, approved_by, approved_at)
         values ($1::public.document_type, '{PREFIX}_{YY}{M}{SEQ}', $2, 4, 1, 'monthly',
                 'approved', $3, now())`,
        [type, prefix, admin.id],
      )
    }

    const readiness = await as(officer.id, (d) => checkConfigReadiness(d, 'quotation', 'TZS'))
    expect(readiness.ready).toBe(true)
    expect(readiness.missing).toEqual([])
  })

  it('exposes exactly the approved rates to the finance engine', async () => {
    const config = await as(officer.id, (d) => loadDocumentConfig(d, 'quotation', 'TZS'))

    expect(config.legalEntity.name).toBe(`E2E Entity ${RUN_ID}`)
    expect(config.tax?.ratePercent).toBe('18.00000')
    expect(config.charges).toHaveLength(1)
    expect(config.charges[0]!.ratePercent).toBe('20.00000')
    expect(config.charges[0]!.appliesBeforeVat).toBe(true)
    expect(config.rounding).toEqual({
      decimalPlaces: 2,
      mode: 'half_up',
      roundAtStep: 'line_total',
    })
  })
})

describe('2. an Engineer files from site', () => {
  it('creates and submits a site submission', async () => {
    submissionId = await as(engineer.id, async (d) => {
      const [created] = await d
        .insert(schema.engineerSubmissions)
        .values({
          projectId,
          clientId,
          submittedBy: engineer.id,
          title: `E2E cooling pump failure ${RUN_ID}`,
          problemDescription: 'Bearing noise on the drive end of cooling pump 2, heavy vibration.',
          recommendedWork: 'Replace both bearings, renew the shaft seal, re-align the coupling.',
          urgency: 'high',
        })
        .returning({ id: schema.engineerSubmissions.id })
      return created!.id
    })

    await as(engineer.id, async (d) => {
      await d.insert(schema.submissionMeasurements).values({
        submissionId,
        label: 'Shaft runout',
        value: '0.12',
        unit: 'mm',
        position: 0,
      })

      const ref = await d.execute(sql`select app.next_submission_reference() as r`)
      await d
        .update(schema.engineerSubmissions)
        .set({
          status: 'submitted',
          reference: (ref.rows[0] as { r: string }).r,
          submittedAt: new Date(),
          submittedSnapshot: { revision: 1 },
        })
        .where(sql`id = ${submissionId}::uuid`)
    })

    const { rows } = await o.query(
      'select status, reference from engineer_submissions where id = $1',
      [submissionId],
    )
    expect(rows[0]!.status).toBe('submitted')
    expect(rows[0]!.reference).toMatch(/^SUB-\d{4}-\d{5}$/)
  })

  it('is accepted by the Technical Officer', async () => {
    await as(officer.id, (d) =>
      d
        .update(schema.engineerSubmissions)
        .set({ status: 'accepted', reviewedBy: officer.id, reviewedAt: new Date() })
        .where(sql`id = ${submissionId}::uuid`),
    )

    const { rows } = await o.query('select status from engineer_submissions where id = $1', [
      submissionId,
    ])
    expect(rows[0]!.status).toBe('accepted')
  })
})

describe('3. the Technical Officer prepares a quotation', () => {
  it('creates it from the submission', async () => {
    quotationId = await as(officer.id, async (d) => {
      const [created] = await d
        .insert(schema.documents)
        .values({
          documentType: 'quotation',
          clientId,
          projectId,
          sourceSubmissionId: submissionId,
          title: `E2E July Maintenance ${RUN_ID}`,
          scopeDescription: 'MAINTENANCE SERVICES',
          servicePeriodLabel: 'JULY 2026',
          currency: 'TZS',
          documentDate: new Date().toISOString().slice(0, 10),
          preparedBy: officer.id,
          status: 'draft',
          filename: proposeFilename({
            documentType: 'quotation',
            clientName: 'E2E Client',
            title: 'July Maintenance',
            date: new Date(),
          }),
          terms: {
            paymentTerms: 'Supplied to Morogoro',
            vatStatement: 'VAT charged.',
            deliveryTime: '45 Days',
          },
        })
        .returning({ id: schema.documents.id })
      return created!.id
    })

    expect(quotationId).toBeTruthy()
  })

  it('prices it with the finance engine, not by hand', async () => {
    await as(officer.id, async (d) => {
      await d.insert(schema.documentLines).values({
        documentId: quotationId,
        position: 0,
        kind: 'service',
        description: 'July 2026 Maintenance Services',
        quantity: '8',
        unitPrice: '1853413.46',
        lineTotal: '0',
      })

      const config = await loadDocumentConfig(d, 'quotation', 'TZS')
      const totals = computeDocumentTotals({
        currency: 'TZS',
        lines: [
          { description: 'July 2026 Maintenance Services', quantity: '8', unitPrice: '1853413.46' },
        ],
        charges: config.charges,
        tax: config.tax,
        rounding: config.rounding,
      })

      await d
        .update(schema.documentLines)
        .set({ lineTotal: totals.lines[0]!.lineTotal })
        .where(sql`document_id = ${quotationId}::uuid`)

      await d.insert(schema.documentCharges).values(
        totals.charges.map((c, i) => ({
          documentId: quotationId,
          code: c.code,
          label: c.label,
          ratePercent: c.ratePercent,
          appliesBeforeVat: c.appliesBeforeVat,
          position: i,
          amount: c.amount,
        })),
      )

      await d
        .update(schema.documents)
        .set({
          subTotal: totals.subTotal,
          chargesBeforeVat: totals.chargesBeforeVat,
          taxableTotal: totals.taxableTotal,
          taxCode: totals.taxCode,
          taxLabel: totals.taxLabel,
          taxRatePercent: totals.taxRatePercent,
          taxAmount: totals.taxAmount,
          grandTotal: totals.grandTotal,
          roundingPolicy: totals.rounding,
          legalEntityId: config.legalEntity.id,
          entityAddressId: config.address?.id ?? null,
          bankAccountId: config.bankAccount?.id ?? null,
        })
        .where(sql`id = ${quotationId}::uuid`)
    })

    const { rows } = await o.query(
      'select sub_total, tax_amount, grand_total from documents where id = $1',
      [quotationId],
    )

    // The arithmetically correct figures for this job.
    expect(Decimal.from(rows[0]!.sub_total).toFixed(2)).toBe('14827307.68')
    expect(Decimal.from(rows[0]!.tax_amount).toFixed(2)).toBe('3202698.46')
    expect(Decimal.from(rows[0]!.grand_total).toFixed(2)).toBe('20995467.68')
  })

  it('allocates a reference and submits for approval', async () => {
    await as(officer.id, async (d) => {
      const result = await d.execute(
        sql`select app.issue_internal_reference('quotation'::public.document_type, 'documents', ${quotationId}::uuid) as reference`,
      )
      const reference = (result.rows[0] as { reference: string }).reference

      const snapshot = { reference, capturedAt: new Date().toISOString() }
      await d.insert(schema.documentVersions).values({
        documentId: quotationId,
        version: 1,
        statusAtCapture: 'pending_approval',
        snapshot,
        contentHash: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
        changeSummary: 'Submitted for approval',
        createdBy: officer.id,
      })

      await d
        .update(schema.documents)
        .set({
          status: 'pending_approval',
          reference,
          currentVersion: 1,
          submittedForApprovalAt: new Date(),
          submittedBy: officer.id,
        })
        .where(sql`id = ${quotationId}::uuid`)
    })

    const { rows } = await o.query('select status, reference from documents where id = $1', [
      quotationId,
    ])
    expect(rows[0]!.status).toBe('pending_approval')
    // The historical HA GROUP form, because that is the rule that was approved.
    expect(rows[0]!.reference).toMatch(/^EQ[a-z0-9]{2}_\d{2}\d{1,2}\d{4}$/)
  })
})

describe('4. the Director approves', () => {
  it('creates a final approved version and locks the document', async () => {
    await as(director.id, async (d) => {
      const snapshot = { approved: true, at: new Date().toISOString() }
      await d.insert(schema.documentVersions).values({
        documentId: quotationId,
        version: 2,
        statusAtCapture: 'approved',
        snapshot,
        contentHash: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
        changeSummary: 'Approved',
        isApprovedVersion: true,
        createdBy: director.id,
      })

      await d
        .update(schema.documents)
        .set({
          status: 'approved',
          currentVersion: 2,
          approvedBy: director.id,
          approvedAt: new Date(),
        })
        .where(sql`id = ${quotationId}::uuid`)

      await d.insert(schema.approvalDecisions).values({
        subjectType: 'document',
        subjectId: quotationId,
        subjectVersion: 1,
        decision: 'approved',
        actorId: director.id,
        actorRole: 'director',
        priorStatus: 'pending_approval',
        newStatus: 'approved',
      })
    })

    const { rows } = await o.query('select status from documents where id = $1', [quotationId])
    expect(rows[0]!.status).toBe('approved')
  })

  it('makes the quotation immutable', async () => {
    await expect(
      o.query('update documents set grand_total = 1 where id = $1', [quotationId]),
    ).rejects.toThrow(/content can no longer be changed/)
  })

  it('renders a real PDF and DOCX from the stored document', async () => {
    const { model, warnings } = await as(officer.id, (d) => buildRenderModel(d, quotationId))

    expect(model.company.entityName).toBe(`E2E Entity ${RUN_ID}`)
    expect(model.client.tin).toBe('100228211')
    expect(model.totals?.grandTotal).toBe('20995467.6800')
    // Brand assets are not seeded here, so the renderer says so rather than
    // silently producing a document without a logo.
    expect(warnings.some((w) => /logo/i.test(w))).toBe(true)

    const [pdf, docx] = await Promise.all([renderDocumentPdf(model), renderDocumentDocx(model)])

    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(pdf.byteLength).toBeGreaterThan(1000)
    expect(docx.subarray(0, 2).toString('latin1')).toBe('PK')
  }, 30_000)
})

describe('5. the client sends a Purchase Order', () => {
  it('is recorded, not generated', async () => {
    poId = await as(officer.id, async (d) => {
      const [created] = await d
        .insert(schema.clientPurchaseOrders)
        .values({
          clientId,
          projectId,
          poNumber: `PO_E2E_${RUN_ID}`,
          poDate: new Date().toISOString().slice(0, 10),
          receivedAt: new Date(),
          currency: 'TZS',
          recordedBy: officer.id,
        })
        .returning({ id: schema.clientPurchaseOrders.id })
      return created!.id
    })

    const { rows } = await o.query('select po_number from client_purchase_orders where id = $1', [
      poId,
    ])
    expect(rows[0]!.po_number).toBe(`PO_E2E_${RUN_ID}`)
  })
})

describe('6. materials are delivered and signed for', () => {
  it('blocks the invoice until the delivery is confirmed', async () => {
    invoiceId = await as(officer.id, async (d) => {
      const [created] = await d
        .insert(schema.documents)
        .values({
          documentType: 'tax_invoice',
          clientId,
          projectId,
          clientPurchaseOrderId: poId,
          sourceDocumentId: quotationId,
          title: `E2E July Invoice ${RUN_ID}`,
          scopeDescription: 'MAINTENANCE SERVICES',
          currency: 'TZS',
          documentDate: new Date().toISOString().slice(0, 10),
          preparedBy: officer.id,
          status: 'draft',
        })
        .returning({ id: schema.documents.id })
      return created!.id
    })

    await expect(
      o.query("update documents set status = 'pending_approval' where id = $1", [invoiceId]),
    ).rejects.toThrow(/Delivery Note or verified completion evidence/)
  })

  it('confirms the delivery once both sides have signed', async () => {
    const deliveryId = await as(officer.id, async (d) => {
      const [created] = await d
        .insert(schema.deliveries)
        .values({
          projectId,
          clientId,
          clientPurchaseOrderId: poId,
          deliveryDate: new Date().toISOString().slice(0, 10),
          handoverPersonId: engineer.id,
          handoverPersonName: 'E2E Engineer',
          receiverName: 'Client Storeman',
          status: 'pending_signatures',
          createdBy: officer.id,
        })
        .returning({ id: schema.deliveries.id })
      return created!.id
    })

    // One side only — still not confirmed.
    await as(officer.id, (d) =>
      d
        .update(schema.deliveries)
        .set({
          handoverSignatureKey: `deliveries/${deliveryId}/ha.png`,
          handoverSignedAt: new Date(),
        })
        .where(sql`id = ${deliveryId}::uuid`),
    )

    let status = await o.query('select status from deliveries where id = $1', [deliveryId])
    expect(status.rows[0]!.status).toBe('pending_signatures')

    // Both sides.
    await as(officer.id, (d) =>
      d
        .update(schema.deliveries)
        .set({
          receiverSignatureKey: `deliveries/${deliveryId}/client.png`,
          receiverSignedAt: new Date(),
          status: 'confirmed',
          confirmedAt: new Date(),
        })
        .where(sql`id = ${deliveryId}::uuid`),
    )

    status = await o.query('select status from deliveries where id = $1', [deliveryId])
    expect(status.rows[0]!.status).toBe('confirmed')
  })
})

describe('7. the tax invoice', () => {
  it('folds the quotation charges into unit prices', async () => {
    await as(officer.id, async (d) => {
      const config = await loadDocumentConfig(d, 'tax_invoice', 'TZS')

      const quotationTotals = computeDocumentTotals({
        currency: 'TZS',
        lines: [
          { description: 'July 2026 Maintenance Services', quantity: '8', unitPrice: '1853413.46' },
        ],
        charges: [
          {
            code: 'ADMIN',
            label: 'Administration',
            ratePercent: '20',
            appliesBeforeVat: true,
            position: 1,
          },
        ],
        tax: config.tax,
        rounding: config.rounding,
      })

      const folded = foldChargesIntoUnitPrices(quotationTotals, config.tax)

      await d.insert(schema.documentLines).values({
        documentId: invoiceId,
        position: 0,
        kind: 'service',
        description: 'MAINTENANCE SERVICES ( JULY 2026 )',
        quantity: '8',
        unitPrice: folded.lines[0]!.unitPrice,
        baseUnitPrice: '1853413.46',
        loadingFactorPercent: folded.loadingFactorPercent,
        lineTotal: '0',
      })

      const invoiceTotals = computeDocumentTotals({
        currency: 'TZS',
        lines: folded.lines,
        charges: [],
        tax: config.tax,
        rounding: config.rounding,
      })

      await d
        .update(schema.documentLines)
        .set({ lineTotal: invoiceTotals.lines[0]!.lineTotal })
        .where(sql`document_id = ${invoiceId}::uuid`)

      await d
        .update(schema.documents)
        .set({
          subTotal: invoiceTotals.subTotal,
          taxableTotal: invoiceTotals.taxableTotal,
          taxCode: invoiceTotals.taxCode,
          taxLabel: invoiceTotals.taxLabel,
          taxRatePercent: invoiceTotals.taxRatePercent,
          taxAmount: invoiceTotals.taxAmount,
          grandTotal: invoiceTotals.grandTotal,
          roundingPolicy: invoiceTotals.rounding,
          legalEntityId: config.legalEntity.id,
          entityAddressId: config.address?.id ?? null,
          bankAccountId: config.bankAccount?.id ?? null,
        })
        .where(sql`id = ${invoiceId}::uuid`)
    })

    const { rows } = await o.query('select sub_total, grand_total from documents where id = $1', [
      invoiceId,
    ])
    // 1,853,413.46 × 1.20 ÷ 1 per unit → the loaded unit price, ×8.
    expect(Decimal.from(rows[0]!.sub_total).toFixed(2)).toBe('17792769.20')
    expect(Decimal.from(rows[0]!.grand_total).toFixed(2)).toBe('20995467.66')
  })

  it('now passes the invoice gate and reaches approval', async () => {
    await as(officer.id, async (d) => {
      const result = await d.execute(
        sql`select app.issue_internal_reference('tax_invoice'::public.document_type, 'documents', ${invoiceId}::uuid) as reference`,
      )
      const reference = (result.rows[0] as { reference: string }).reference

      const snapshot = { reference }
      await d.insert(schema.documentVersions).values({
        documentId: invoiceId,
        version: 1,
        statusAtCapture: 'pending_approval',
        snapshot,
        contentHash: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
        createdBy: officer.id,
      })

      await d
        .update(schema.documents)
        .set({
          status: 'pending_approval',
          reference,
          currentVersion: 1,
          submittedForApprovalAt: new Date(),
          submittedBy: officer.id,
        })
        .where(sql`id = ${invoiceId}::uuid`)
    })

    const { rows } = await o.query('select status, reference from documents where id = $1', [
      invoiceId,
    ])
    expect(rows[0]!.status).toBe('pending_approval')
    expect(rows[0]!.reference).toMatch(/^EI[a-z0-9]{2}_/)
  })

  it('is approved and becomes immutable', async () => {
    await as(director.id, async (d) => {
      const snapshot = { approved: true }
      await d.insert(schema.documentVersions).values({
        documentId: invoiceId,
        version: 2,
        statusAtCapture: 'approved',
        snapshot,
        contentHash: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
        isApprovedVersion: true,
        createdBy: director.id,
      })

      await d
        .update(schema.documents)
        .set({
          status: 'approved',
          currentVersion: 2,
          approvedBy: director.id,
          approvedAt: new Date(),
        })
        .where(sql`id = ${invoiceId}::uuid`)
    })

    await expect(
      o.query('update documents set grand_total = 1 where id = $1', [invoiceId]),
    ).rejects.toThrow(/content can no longer be changed/)
  })

  it('renders as a tax invoice, with the statutory band and banking block', async () => {
    const { model } = await as(officer.id, (d) => buildRenderModel(d, invoiceId))

    expect(model.documentType).toBe('tax_invoice')
    expect(model.company.tin).toBe('168-189-478')
    expect(model.company.vrn).toBe('40-318389-G')
    expect(model.bank?.bankName).toBe('AZANIA BANK LIMITED')
    expect(model.purchaseOrderNumber).toBe(`PO_E2E_${RUN_ID}`)

    const pdf = await renderDocumentPdf(model)
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  }, 30_000)
})

describe('8. the EFD receipt', () => {
  it('is recorded from the certified device, never generated', async () => {
    await as(officer.id, (d) =>
      d.insert(schema.efdReceipts).values({
        invoiceDocumentId: invoiceId,
        projectId,
        clientId,
        receiptNumber: `EFD-${RUN_ID}`,
        issuedOn: new Date().toISOString().slice(0, 10),
        status: 'recorded',
        provider: 'manual',
        recordedBy: officer.id,
      }),
    )

    const { rows } = await o.query(
      'select receipt_number, provider from efd_receipts where invoice_document_id = $1',
      [invoiceId],
    )
    expect(rows[0]!.receipt_number).toBe(`EFD-${RUN_ID}`)
    // Honest about where it came from.
    expect(rows[0]!.provider).toBe('manual')
  })
})

describe('9. everything is findable and attributable', () => {
  it('both documents appear in a repository search', async () => {
    const found = await as(officer.id, async (d) => {
      const result = await d.execute(sql`
        select d.reference, d.document_type, po.po_number
        from public.documents d
        join public.clients c on c.id = d.client_id
        left join public.client_purchase_orders po on po.id = d.client_purchase_order_id
        where d.title ilike ${`%${RUN_ID}%`}
        order by d.document_type
      `)
      return result.rows as Array<{
        reference: string
        document_type: string
        po_number: string | null
      }>
    })

    expect(found).toHaveLength(2)
    expect(found.map((f) => f.document_type).sort()).toEqual(['quotation', 'tax_invoice'])
    expect(found.find((f) => f.document_type === 'tax_invoice')?.po_number).toBe(`PO_E2E_${RUN_ID}`)
  })

  it('the invoice is traceable back to its quotation and submission', async () => {
    const { rows } = await o.query(
      `select i.reference as invoice_ref, q.reference as quotation_ref, s.reference as submission_ref
       from documents i
       join documents q on q.id = i.source_document_id
       left join engineer_submissions s on s.id = q.source_submission_id
       where i.id = $1`,
      [invoiceId],
    )

    expect(rows[0]!.invoice_ref).toMatch(/^EI/)
    expect(rows[0]!.quotation_ref).toMatch(/^EQ/)
    expect(rows[0]!.submission_ref).toMatch(/^SUB-/)
  })

  it('every reference issued is unique and recorded', async () => {
    const { rows } = await o.query(
      `select count(*)::int as total, count(distinct formatted)::int as unique_count
       from internal_references where entity_id in ($1, $2)`,
      [quotationId, invoiceId],
    )
    expect(rows[0]!.total).toBe(2)
    expect(rows[0]!.unique_count).toBe(2)
  })

  it('leaves an approval decision naming the Director and their role', async () => {
    const { rows } = await o.query(
      `select actor_role, decision from approval_decisions
       where subject_id = $1 and subject_type = 'document'`,
      [quotationId],
    )
    expect(rows[0]!.actor_role).toBe('director')
    expect(rows[0]!.decision).toBe('approved')
  })
})

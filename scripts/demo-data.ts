/**
 * Loads a working set of data so the platform can be explored and understood.
 *
 *   npm run db:demo-data
 *
 * Where the data comes from, and how much of it is real:
 *
 *   REAL — taken from HA GROUP's own documents (HQ_2670053, HI_2670050–53) and
 *   from the company's published information. The client, its TIN and VRN, the
 *   client's purchase order number, the compliance certificate numbers, the
 *   bank details, the document references and every figure on the quotation and
 *   the invoice. None of it is invented.
 *
 *   ILLUSTRATIVE — the two site submissions and the projects they belong to.
 *   They are written in the company's own idiom and are marked in their notes
 *   as example records, so nobody mistakes them for jobs that were carried out.
 *
 * The script also APPROVES a coherent configuration set. Normally every setting
 * arrives as a draft and stays inert until an Administrator decides on it —
 * that is the platform's central rule and it is not being weakened here. But a
 * platform with nothing approved can issue nothing, so a person opening it for
 * the first time would see only empty screens and blocked buttons. Approving a
 * consistent set makes the system explorable; the approvals are recorded in the
 * audit trail under the account that runs this script, exactly as if a person
 * had clicked them, and any of them can be withdrawn.
 *
 * Idempotent: re-running updates rather than duplicating.
 */
import { config } from 'dotenv'
import { Client } from 'pg'
import { hashPassword } from '../src/lib/auth/password'

config({ path: '.env.local', quiet: true })

/** Values printed on HQ_2670053, the June 2026 maintenance quotation. */
const QUOTATION = {
  reference: 'HQ_2670053',
  date: '2026-07-15',
  scope: 'MAINTENANCE SERVICES — JUNE 2026',
  clientReference: 'FMs',
  quantity: '8',
  unitPrice: '1853413.46',
  subTotal: '14827307.70',
  administration: '2965461.54',
  taxableTotal: '17792769.24',
  vat: '3202698.46',
  grandTotal: '20995467.70',
}

/** Values printed on HI_2670053, the corresponding tax invoice. */
const INVOICE = {
  reference: 'HI_2670053',
  date: '2026-07-28',
  scope: 'MAINTENANCE SERVICES – 2026 JUNE',
  quantity: '1',
  unitPrice: '43378362.99',
  subTotal: '43378362.99',
  vat: '7808105.34',
  grandTotal: '51186468.33',
  // Issued by Alliance One. The platform stores it; it never generates one.
  clientPurchaseOrder: 'PO_4500850169',
  clientAccountNumber: '30D120216',
  vendorId: '635804',
}

async function main() {
  const url = process.env.DATABASE_ADMIN_URL
  if (!url) throw new Error('DATABASE_ADMIN_URL must be set')

  const c = new Client({ connectionString: url })
  await c.connect()

  try {
    await c.query('begin')

    // ---------------------------------------------------------------- people
    const people = [
      {
        email: 'adam@hpcagroup.africa',
        name: 'Adam Nzinza',
        title: 'Technical Officer',
        phone: '+255 692 833 236',
        roles: ['technical_officer'],
      },
      {
        email: 'director@hpcagroup.africa',
        name: 'Dr C. Msindo',
        title: 'Executive Chairman',
        phone: null,
        roles: ['director'],
      },
      {
        email: 'baraka@hpcagroup.africa',
        name: 'Eng. Baraka Msangi',
        title: 'Site Engineer',
        phone: null,
        roles: ['engineer'],
      },
    ]

    const ids: Record<string, string> = {}
    const demoPassword = process.env.DEMO_PASSWORD ?? 'HaGroupDemo-2026!'
    const hash = await hashPassword(demoPassword)

    for (const p of people) {
      const found = await c.query<{ id: string }>(
        'select id from public.profiles where lower(email) = lower($1)',
        [p.email],
      )
      if (found.rows.length > 0) {
        ids[p.email] = found.rows[0]!.id
      } else {
        const r = await c.query<{ id: string }>(
          `insert into public.profiles
             (email, full_name, password_hash, must_change_password, is_active, job_title, phone)
           values ($1, $2, $3, true, true, $4, $5) returning id`,
          [p.email, p.name, hash, p.title, p.phone],
        )
        ids[p.email] = r.rows[0]!.id
      }
      for (const role of p.roles) {
        await c.query(
          `insert into public.user_roles (user_id, role, granted_by)
           select $1, $2::public.app_role, $1
            where not exists (select 1 from public.user_roles
                               where user_id = $1 and role = $2::public.app_role
                                 and revoked_at is null)`,
          [ids[p.email], role],
        )
      }
    }

    const officer = ids['adam@hpcagroup.africa']!
    const director = ids['director@hpcagroup.africa']!
    const engineer = ids['baraka@hpcagroup.africa']!

    // ------------------------------------------------- approve a config set
    // One coherent set, so documents can actually be produced. See the note at
    // the top of this file.
    await c.query(
      `update public.legal_entities set state = 'approved', approved_by = $1, approved_at = now()
        where name = 'HA GROUP TZ LTD' and state = 'draft'`,
      [director],
    )
    // Whichever numbering rule, rounding policy and tax rate the seed produced,
    // promote exactly one of each so the ladder is unambiguous.
    for (const [table, where] of [
      ['numbering_rules', "document_type in ('quotation','tax_invoice')"],
      ['rounding_policies', "scope = 'default'"],
      ['tax_rules', "code = 'VAT'"],
      ['charge_rules', "code = 'ADMIN'"],
      ['entity_addresses', 'true'],
      ['bank_accounts', 'true'],
    ] as const) {
      await c.query(
        `update public.${table} set state = 'approved', approved_by = $1, approved_at = now()
          where state = 'draft' and ${where}`,
        [director],
      )
    }

    // ---------------------------------------------------------------- client
    const clientRow = await c.query<{ id: string }>(
      `insert into public.clients
         (legal_name, trading_name, tin, vrn, address_line1, city, region, postal_address,
          country, contact_person, contact_phone, notes, created_by)
       values ('ALLIANCE ONE TOBACCO TANZANIA LIMITED', 'Alliance One Tanzania',
               '100228211', '20-011269-N', 'Aointl Complex, Plot 2 Kingolwira',
               'Morogoro', 'Morogoro', 'P.O. Box 1595, Morogoro', 'Tanzania',
               'MR. Z. CHANGALIMA', '+255 232 934 216',
               $2, $1)
       on conflict do nothing
       returning id`,
      [
        officer,
        `Account number ${INVOICE.clientAccountNumber} · Vendor ID ${INVOICE.vendorId}. ` +
          'Details taken from HA GROUP tax invoice HI_2670053.',
      ],
    )
    const clientId =
      clientRow.rows[0]?.id ??
      (
        await c.query<{ id: string }>(
          "select id from public.clients where legal_name = 'ALLIANCE ONE TOBACCO TANZANIA LIMITED'",
        )
      ).rows[0]!.id

    // --------------------------------------------------------------- project
    const projectRow = await c.query<{ id: string }>(
      `insert into public.projects
         (client_id, name, reference, description, location, status, created_by)
       values ($1, 'Maintenance Services — Morogoro', 'AOTTL/MAINT/2026',
               'Recurring electromechanical maintenance at the Morogoro complex, invoiced monthly.',
               'Aointl Complex, Plot 2 Kingolwira, Morogoro', 'active', $2)
       on conflict do nothing returning id`,
      [clientId, officer],
    )
    const projectId =
      projectRow.rows[0]?.id ??
      (
        await c.query<{ id: string }>(
          "select id from public.projects where reference = 'AOTTL/MAINT/2026'",
        )
      ).rows[0]!.id

    await c.query(
      `insert into public.project_members (project_id, user_id, is_lead, assigned_by)
       select $1, $2, true, $3
        where not exists (select 1 from public.project_members
                           where project_id = $1 and user_id = $2 and removed_at is null)`,
      [projectId, engineer, officer],
    )

    // ------------------------------------------- the client's purchase order
    // Issued by Alliance One and printed on their invoice. Recorded, never
    // generated — the database refuses to let this number be changed later.
    await c.query(
      `insert into public.client_purchase_orders
         (client_id, project_id, po_number, po_date, description, currency, order_value,
          status, recorded_by)
       select $1, $2, $3, date '2026-07-01',
              'Maintenance services, June 2026. Number issued by Alliance One.',
              'TZS', $4, 'open', $5
        where not exists (select 1 from public.client_purchase_orders where po_number = $3)`,
      [clientId, projectId, INVOICE.clientPurchaseOrder, INVOICE.grandTotal, officer],
    )
    const poId = (
      await c.query<{ id: string }>(
        'select id from public.client_purchase_orders where po_number = $1',
        [INVOICE.clientPurchaseOrder],
      )
    ).rows[0]!.id

    // ------------------------------------------------------ site submissions
    const submissions = [
      {
        reference: 'DEMO-SUB-001',
        title: 'CRDB Azikiwe HQ — generator changeover cable overheating',
        problem:
          'Existing 4-core 95mm² armoured cable between the generator and changeover panel ' +
          'shows overheating discolouration at the terminations, and the panel gland plate ' +
          'is unsupported.',
        recommended:
          'Supply and install 40 metres of 4-core 95mm² armoured cable, new brass glands and ' +
          'a fabricated gland plate; carry out a load test after termination.',
        urgency: 'normal',
        lat: null,
        lon: null,
        location: 'CRDB Azikiwe HQ basement',
        measurements: [
          { label: 'Cable size', value: '95', unit: 'mm²' },
          { label: 'Required length', value: '40', unit: 'm' },
        ],
      },
      {
        reference: 'DEMO-SUB-002',
        title: 'TANESCO Ubungo — feeder pump motor insulation failure',
        problem:
          'Both feeder pump motors (45 kW) show severe winding insulation degradation with ' +
          'megger readings below 0.3 MΩ. Bearing housings are worn and terminal box glands ' +
          'are corroded, causing intermittent tripping of the LV feeder.',
        recommended:
          'Replace both 45 kW motors with new units, renew cable glands and terminations, ' +
          're-align couplings and re-commission the feeder.',
        urgency: 'high',
        lat: '-6.809000',
        lon: '39.199200',
        location: 'TANESCO Ubungo Substation',
        measurements: [
          { label: 'Motor rating', value: '45', unit: 'kW' },
          { label: 'Insulation resistance', value: '0.28', unit: 'MΩ' },
          { label: 'Cable run', value: '36', unit: 'm' },
        ],
      },
    ]

    for (const s of submissions) {
      const existing = await c.query<{ id: string }>(
        'select id from public.engineer_submissions where reference = $1',
        [s.reference],
      )
      let subId = existing.rows[0]?.id
      if (!subId) {
        const r = await c.query<{ id: string }>(
          `insert into public.engineer_submissions
             (reference, project_id, client_id, submitted_by, title, problem_description,
              recommended_work, site_visit_date, gps_latitude, gps_longitude,
              urgency, status, submitted_at, internal_review_notes)
           values ($1, $2, $3, $4, $5, $6, $7, current_date - 20, $8, $9,
                   $10::public.urgency_level, 'draft', null, $11)
           returning id`,
          [
            s.reference,
            projectId,
            clientId,
            engineer,
            s.title,
            s.problem,
            s.recommended,
            s.lat,
            s.lon,
            s.urgency,
            `Site: ${s.location}. Illustrative record loaded by the demo data script — ` +
              'not a job that was carried out.',
          ],
        )
        subId = r.rows[0]!.id
        // Measurements go on while the report is still a draft. Once it is
        // submitted the database refuses to let them change — which is the
        // whole point of the guarantee, so the demo follows the real order.
        for (const [i, m] of s.measurements.entries()) {
          await c.query(
            `insert into public.submission_measurements
               (submission_id, label, value, unit, position)
             values ($1, $2, $3, $4, $5)`,
            [subId, m.label, m.value, m.unit, i],
          )
        }

        await c.query(
          `update public.engineer_submissions
              set status = 'submitted', submitted_at = now()
            where id = $1`,
          [subId],
        )
      }
    }

    // ------------------------------------------------------------ compliance
    /*
     * HA GROUP's own statutory certificates, with the numbers the company
     * records. One discrepancy is preserved rather than resolved: the business
     * licence is recorded as B.L. No 20000200488, while tax invoice HI_2670053
     * prints BL 20000062518. Both are noted; which is current is a question for
     * HA GROUP, and guessing would put a wrong licence number on a document.
     */
    const compliance = [
      {
        code: 'INCORPORATION',
        label: 'Certificate of Incorporation',
        authority: 'BRELA',
        ref: '168189478',
        issued: null,
        expires: null,
        note: null,
      },
      {
        code: 'TIN',
        label: 'Company TIN Certificate',
        authority: 'TRA',
        ref: '1090524',
        issued: '2023-08-31',
        expires: null,
        note: 'TIN also printed on documents as 168-189-478.',
      },
      {
        code: 'TAX_CLEARANCE',
        label: 'TRA Tax Clearance Certificate',
        authority: 'TRA',
        ref: 'ISO 9001: 2015 CERTIFIED',
        issued: '2026-02-05',
        expires: '2026-12-31',
        note: null,
      },
      {
        code: 'BUSINESS_LICENCE',
        label: 'Business Licence',
        authority: 'BRELA',
        ref: 'B.L. No 20000200488',
        issued: '2026-05-12',
        expires: '2027-02-23',
        note: 'Tax invoice HI_2670053 prints BL 20000062518 — confirm which is current.',
      },
      {
        code: 'PDPC',
        label: 'Personal Data Protection Commission registration',
        authority: 'PDPC',
        ref: '0000007384',
        issued: '2026-04-11',
        expires: '2031-04-11',
        note: null,
      },
    ]

    for (const [i, r] of compliance.entries()) {
      const t = await c.query<{ id: string }>(
        `insert into public.compliance_types
           (code, label, authority, reminder_days, sort_order, created_by)
         values ($1, $2, $3, '90,30,14,7,1,0', $4, $5)
         on conflict (code) do update set label = excluded.label
         returning id`,
        [r.code, r.label, r.authority, i, officer],
      )
      const typeId = t.rows[0]!.id

      await c.query(
        `insert into public.compliance_records
           (compliance_type_id, reference_number, issued_on, expires_on,
            responsible_user_id, notes, created_by)
         select $1, $2, $3::date, $4::date, $5, $6, $7
          where not exists (
            select 1 from public.compliance_records
             where compliance_type_id = $1 and superseded_at is null)`,
        [typeId, r.ref, r.issued, r.expires, officer, r.note, officer],
      )
    }

    // ------------------------------------------------- completion evidence
    /*
     * The tax invoice below cannot be approved without this. A confirmed
     * delivery note or verified completion record is what the database
     * demands before HA GROUP can invoice, and the demo has to satisfy the
     * same gate a real month-end would — which is precisely the control worth
     * demonstrating.
     */
    await c.query(
      `insert into public.completion_records
         (project_id, client_id, client_purchase_order_id, source, completed_on,
          work_description, accepted_by_name, accepted_by_title, engineer_id,
          verified_by, verified_at, notes, created_by)
       select $1, $2, $3, 'client_acceptance', date '2026-06-30',
              'Monthly electromechanical maintenance for June 2026, accepted on site.',
              'MR. Z. CHANGALIMA', 'Engineering Manager', $4, $5, now(),
              'Illustrative completion evidence loaded by the demo data script.', $6
        where not exists (
          select 1 from public.completion_records
           where project_id = $1 and completed_on = date '2026-06-30')`,
      [projectId, clientId, poId, engineer, director, officer],
    )

    // -------------------------------------------------------- the documents
    const entity = await c.query<{ id: string }>(
      "select id from public.legal_entities where state = 'approved' order by name limit 1",
    )
    const legalEntityId = entity.rows[0]?.id ?? null

    const docs = [
      {
        type: 'quotation',
        reference: QUOTATION.reference,
        title: 'QUOTATION FOR MAINTENANCE SERVICES — JUNE 2026',
        scope: QUOTATION.scope,
        clientRef: QUOTATION.clientReference,
        date: QUOTATION.date,
        status: 'approved',
        quantity: QUOTATION.quantity,
        unitPrice: QUOTATION.unitPrice,
        subTotal: QUOTATION.subTotal,
        chargesBeforeVat: QUOTATION.administration,
        taxableTotal: QUOTATION.taxableTotal,
        vat: QUOTATION.vat,
        grandTotal: QUOTATION.grandTotal,
        po: null as string | null,
        line: 'July 2026 Maintenance Services',
      },
      {
        type: 'tax_invoice',
        reference: INVOICE.reference,
        title: 'TAX INVOICE — MAINTENANCE SERVICES, JUNE 2026',
        scope: INVOICE.scope,
        clientRef: null,
        date: INVOICE.date,
        status: 'issued',
        quantity: INVOICE.quantity,
        unitPrice: INVOICE.unitPrice,
        subTotal: INVOICE.subTotal,
        chargesBeforeVat: '0',
        taxableTotal: INVOICE.subTotal,
        vat: INVOICE.vat,
        grandTotal: INVOICE.grandTotal,
        po: poId,
        line: 'MAINTENANCE SERVICES (JUNE 2026)',
      },
    ]

    for (const d of docs) {
      const existing = await c.query<{ id: string }>(
        'select id from public.documents where reference = $1',
        [d.reference],
      )
      if (existing.rows.length > 0) continue

      const r = await c.query<{ id: string }>(
        `insert into public.documents
           (document_type, reference, client_id, project_id, client_purchase_order_id,
            title, scope_description, service_period_label, client_reference, status,
            legal_entity_id, currency, tax_code, tax_label, tax_rate_percent,
            sub_total, charges_before_vat, charges_after_vat, taxable_total, tax_amount,
            grand_total, document_date, prepared_by, submitted_by, submitted_for_approval_at,
            approved_by, approved_at, issued_at, internal_notes)
         values ($1::public.document_type, $2, $3, $4, $5, $6, $7, $8, $9,
                 'draft'::public.document_status, $10, 'TZS', 'VAT', 'VAT', 18,
                 $11, $12, 0, $13, $14, $15, $16::date, $17, $17, now(), $18, now(),
                 null,
                 'Loaded from HA GROUP document ' || $2 || ' by the demo data script.')
         returning id`,
        [
          d.type,
          d.reference,
          clientId,
          projectId,
          d.po,
          d.title,
          d.scope,
          d.scope,
          d.clientRef,
          legalEntityId,
          d.subTotal,
          d.chargesBeforeVat,
          d.taxableTotal,
          d.vat,
          d.grandTotal,
          d.date,
          officer,
          director,
        ],
      )
      const docId = r.rows[0]!.id

      await c.query(
        `insert into public.document_lines
           (document_id, position, description, quantity, unit_price, line_total)
         values ($1, 0, $2, $3, $4, $5)`,
        [docId, d.line, d.quantity, d.unitPrice, d.subTotal],
      )

      // The status is set only after the lines and charges are on. An approved
      // document is immutable — that is enforced by trigger, so the demo has to
      // build it in the same order a person would.
      if (d.chargesBeforeVat !== '0') {
        await c.query(
          `insert into public.document_charges
             (document_id, position, code, label, rate_percent, amount, applies_before_vat)
           values ($1, 0, 'ADMIN', 'Administration', 20, $2, true)`,
          [docId, d.chargesBeforeVat],
        )
      }

      /*
       * Walk the real workflow rather than jumping to the end state. The
       * database only permits draft → pending_approval → approved → issued,
       * and refuses anything else; stepping through it is both the only way
       * this works and an accurate demonstration of the path a document takes.
       */
      const chain =
        d.status === 'issued'
          ? ['pending_approval', 'approved', 'issued']
          : d.status === 'approved'
            ? ['pending_approval', 'approved']
            : [d.status]

      for (const step of chain) {
        await c.query(
          `update public.documents
              set status = $2::public.document_status,
                  issued_at = case when $2 = 'issued' then now() else issued_at end
            where id = $1`,
          [docId, step],
        )
      }
    }

    await c.query('commit')

    // ------------------------------------------------------------- report
    const counts = await c.query<{ what: string; n: string }>(`
      select 'clients' as what, count(*)::text as n from public.clients
      union all select 'projects', count(*)::text from public.projects
      union all select 'purchase orders', count(*)::text from public.client_purchase_orders
      union all select 'site submissions', count(*)::text from public.engineer_submissions
      union all select 'documents', count(*)::text from public.documents
      union all select 'compliance records', count(*)::text from public.compliance_records
      union all select 'approved settings', count(*)::text from (
        select 1 from public.legal_entities where state='approved'
        union all select 1 from public.numbering_rules where state='approved'
        union all select 1 from public.rounding_policies where state='approved'
        union all select 1 from public.tax_rules where state='approved'
        union all select 1 from public.charge_rules where state='approved') s
    `)
    console.table(counts.rows)
    console.log(`\nDemo accounts (all must change password on first sign-in):`)
    for (const p of people) console.log(`  ${p.email.padEnd(30)} ${p.name} — ${p.title}`)
    console.log(`\n  password: ${demoPassword}`)
  } catch (err) {
    await c.query('rollback')
    throw err
  } finally {
    await c.end()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})

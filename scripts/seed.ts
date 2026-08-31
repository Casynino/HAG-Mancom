/**
 * Initial records.
 *
 * Two categories, treated differently:
 *
 *   1. Operational defaults stated in the brief — the approval policy that
 *      Director approval is required for every document type. These are seeded
 *      APPROVED, because they are instructions, not extractions.
 *
 *   2. Values observed in historical HA GROUP documents during Phase 0 — entity
 *      names, addresses, bank details, numbering patterns, the 20% administration
 *      charge, 18% VAT, the Brand Profile. Every one of these is seeded as a
 *      DRAFT and is inert until an Administrator reviews and approves it.
 *      Several of them are in direct conflict with each other in the source
 *      documents, which is precisely why none may be activated automatically.
 *
 * Idempotent: re-running does not duplicate or overwrite.
 */
import { config } from 'dotenv'
import { Client } from 'pg'
import { hashPassword, validatePasswordStrength } from '../src/lib/auth/password'

config({ path: '.env.local', quiet: true })

async function main() {
  const url = process.env.DATABASE_ADMIN_URL
  if (!url) throw new Error('DATABASE_ADMIN_URL must be set')

  const email = process.env.BOOTSTRAP_ADMIN_EMAIL
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD
  const name = process.env.BOOTSTRAP_ADMIN_NAME ?? 'System Administrator'

  if (!email || !password) {
    throw new Error(
      'BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must be set in .env.local.\n' +
        'They are read once to create the first Administrator and should be removed afterwards.',
    )
  }

  const problems = validatePasswordStrength(password)
  if (problems.length > 0) {
    throw new Error(`BOOTSTRAP_ADMIN_PASSWORD is too weak:\n  - ${problems.join('\n  - ')}`)
  }

  const c = new Client({ connectionString: url })
  await c.connect()

  try {
    await c.query('begin')

    // --- Administrator -----------------------------------------------------
    const existing = await c.query<{ id: string }>(
      'select id from public.profiles where lower(email) = lower($1)',
      [email],
    )

    let adminId: string
    if (existing.rows.length > 0) {
      adminId = existing.rows[0]!.id
      console.log(`administrator already exists (${email})`)
    } else {
      const hash = await hashPassword(password)
      const inserted = await c.query<{ id: string }>(
        `insert into public.profiles (email, full_name, password_hash, must_change_password, is_active, job_title)
         values ($1, $2, $3, true, true, 'System Administrator')
         returning id`,
        [email, name, hash],
      )
      adminId = inserted.rows[0]!.id
      console.log(`created administrator ${email} (must change password on first sign-in)`)
    }

    await c.query(
      `insert into public.user_roles (user_id, role, granted_by)
       select $1, 'administrator', $1
       where not exists (
         select 1 from public.user_roles
         where user_id = $1 and role = 'administrator' and revoked_at is null
       )`,
      [adminId],
    )

    // --- Approval policies: stated in the brief, therefore approved ---------
    const documentTypes = [
      'quotation',
      'tax_invoice',
      'delivery_note',
      'official_letter',
      'payment_request',
      'site_report',
      'completion_certificate',
      'purchase_order_record',
      'compliance_document',
      'export_invoice',
      'efd_receipt',
    ]

    for (const dt of documentTypes) {
      // Signature and stamp requirements follow the Phase 0 evidence: quotations
      // carried a typed name block, tax invoices carried the company stamp.
      const requiresStamp = dt === 'tax_invoice' || dt === 'export_invoice'
      const requiresSignature = dt === 'official_letter' || dt === 'completion_certificate'

      await c.query(
        `insert into public.approval_policies (
           document_type, requires_director_approval, technical_officer_may_approve,
           delegation_urgent_only, requires_signature, requires_stamp,
           state, created_by, approved_by, approved_at, notes)
         select $1::public.document_type, true, false, true, $2, $3,
                'approved', $4, $4, now(),
                'Default from the master brief: Director approval required for all documents.'
         where not exists (
           select 1 from public.approval_policies
           where document_type = $1::public.document_type and state = 'approved'
         )`,
        [dt, requiresSignature, requiresStamp, adminId],
      )
    }
    console.log(`ensured approval policies for ${documentTypes.length} document types`)

    // --- Phase 0 observations: DRAFT only ----------------------------------
    const draftNote = 'Observed in Phase 0 document analysis. Requires review before use.'

    // Two conflicting entity names appear across the sample documents. Both are
    // recorded so an Administrator can resolve the conflict deliberately.
    const entities: Array<[string, string, string]> = [
      [
        'HA GROUP TZ LTD',
        'TZ LTD',
        'Entity name as printed on quotations HQ_2670052 and HQ_2670053. ' +
          'Conflicts with the name on tax invoices. Bank account and company stamp ' +
          'both read "HA GROUP TZ LIMITED". Requires legal confirmation.',
      ],
      [
        'HA GROUP PTY LTD',
        'PTY LTD',
        'Entity name as printed on tax invoices HI_2670050 to HI_2670053. ' +
          '"PTY LTD" is a Southern African company form appearing on a Tanzanian tax ' +
          'invoice bearing Tanzanian TIN and VRN. Requires legal confirmation before use.',
      ],
    ]

    const entityIds: Record<string, string> = {}
    for (const [entityName, suffix, notes] of entities) {
      const found = await c.query<{ id: string }>(
        'select id from public.legal_entities where name = $1',
        [entityName],
      )
      if (found.rows.length > 0) {
        entityIds[entityName] = found.rows[0]!.id
        continue
      }
      const ins = await c.query<{ id: string }>(
        `insert into public.legal_entities (
           name, entity_suffix, country_code, registration_number, tin, vrn,
           business_licence, import_export_licence, is_default, state, notes, created_by)
         values ($1, $2, 'TZ', '168189478', '168-189-478', '40-318389-G',
                 '20000062518', null, false, 'draft', $3, $4)
         returning id`,
        [entityName, suffix, notes, adminId],
      )
      entityIds[entityName] = ins.rows[0]!.id
    }
    console.log('seeded 2 draft legal entities (conflicting — awaiting resolution)')

    // Two different Tanzania addresses, one per document type.
    const tzLtd = entityIds['HA GROUP TZ LTD']!
    const ptyLtd = entityIds['HA GROUP PTY LTD']!

    const addresses: Array<Record<string, unknown>> = [
      {
        entity: tzLtd,
        label: 'Dar es Salaam — as printed on quotations',
        line1: '9th Floor Derm Plaza, Plot 18',
        line2: 'Block 45A, Bagamoyo Rd',
        line3: 'Kijitonyama',
        city: 'Dar es Salaam',
      },
      {
        entity: ptyLtd,
        label: 'Dar es Salaam — as printed on tax invoices',
        line1: '54 Andries Street',
        line2: 'Ilala 12101',
        line3: null,
        city: 'Dar es Salaam',
      },
    ]

    for (const a of addresses) {
      await c.query(
        `insert into public.entity_addresses (
           legal_entity_id, label, kind, address_line1, address_line2, address_line3,
           city, country, phone, alternate_phone, whatsapp, email, website,
           is_default, state, created_by)
         select $1, $2, 'trading', $3, $4, $5, $6, 'Tanzania',
                '+255 653 625 659', '+255 749 927 003', '+255 765 754 638',
                'business@hpcagroup.africa', 'www.hpcagroup.africa',
                false, 'draft', $7
         where not exists (select 1 from public.entity_addresses where label = $2)`,
        [a.entity, a.label, a.line1, a.line2, a.line3, a.city, adminId],
      )
    }
    console.log('seeded 2 draft trading addresses (conflicting — awaiting resolution)')

    // Bank accounts, shown on tax invoices only.
    for (const [currency, accountNumber] of [
      ['TZS', '033000002678'],
      ['USD', '033010000710'],
    ]) {
      await c.query(
        `insert into public.bank_accounts (
           legal_entity_id, currency, account_name, bank_name, branch, branch_code,
           account_number, swift_code, sort_code, is_default, state, notes, created_by)
         select $1, $2, 'HA GROUP TZ LIMITED', 'AZANIA BANK LIMITED', 'OYSTERBAY',
                '0310033', $3, 'AZANTZTZ', '031033', false, 'draft', $4, $5
         where not exists (
           select 1 from public.bank_accounts where account_number = $3
         )`,
        [tzLtd, currency, accountNumber, draftNote, adminId],
      )
    }
    console.log('seeded 2 draft bank accounts (TZS, USD)')

    // Numbering: the historical form and the form named in the master brief.
    // They are incompatible, so both are drafts and neither is active.
    const numbering: Array<[string, string, string, string, string]> = [
      [
        'quotation',
        '{PREFIX}_{YY}{M}{SEQ}',
        'HQ',
        'monthly',
        'Historical form observed on HQ_2670052 and HQ_2670053 (July 2026). ' +
          'Whether the sequence resets monthly or annually could not be determined ' +
          'from a single month of evidence — monthly is an assumption to confirm.',
      ],
      [
        'tax_invoice',
        '{PREFIX}_{YY}{M}{SEQ}',
        'HI',
        'monthly',
        'Historical form observed on HI_2670050 to HI_2670053 (July 2026). Same reset assumption.',
      ],
      [
        'delivery_note',
        'HA/DN/{YYYY}/{SEQ}',
        'HA',
        'yearly',
        'Form named in the master brief. No historical delivery note was supplied, ' +
          'so this pattern is unverified against any real document.',
      ],
    ]

    for (const [dt, pattern, prefix, reset, notes] of numbering) {
      await c.query(
        `insert into public.numbering_rules (
           document_type, pattern, prefix, sequence_padding, sequence_start,
           reset_period, state, notes, created_by)
         select $1::public.document_type, $2, $3, 4, 1, $4::public.numbering_reset,
                'draft', $5, $6
         where not exists (
           select 1 from public.numbering_rules
           where document_type = $1::public.document_type and pattern = $2
         )`,
        [dt, pattern, prefix, reset, notes, adminId],
      )
    }
    console.log('seeded 3 draft numbering rules (patterns in conflict — awaiting decision)')

    // The 20% administration charge, applied BEFORE VAT.
    await c.query(
      `insert into public.charge_rules (
         code, label, rate_percent, document_type, position, applies_before_vat,
         state, notes, created_by)
       select 'ADMIN', 'Administration', 20.00000, 'quotation', 1, true, 'draft', $1, $2
       where not exists (select 1 from public.charge_rules where code = 'ADMIN')`,
      [
        'Observed at 20% on both sample quotations, added to the subtotal before VAT ' +
          'is calculated. On the matching tax invoice the same 20% is folded into the ' +
          'unit price instead. Both samples are the same client in one month, so the ' +
          'rate cannot yet be treated as company-wide.',
        adminId,
      ],
    )

    await c.query(
      `insert into public.tax_rules (code, label, rate_percent, document_type, state, notes, created_by)
       select 'VAT', 'VAT', 18.00000, null, 'draft', $1, $2
       where not exists (select 1 from public.tax_rules where code = 'VAT')`,
      [
        'Observed at 18% on all six sample documents, applied after the administration ' +
          'charge on quotations. Verified arithmetically. Confirm against current TRA rates.',
        adminId,
      ],
    )

    await c.query(
      `insert into public.rounding_policies (
         scope, currency, decimal_places, mode, round_at_step, state, notes, created_by)
       select 'default', 'TZS', 2, 'half_up', 'line_total', 'draft', $1, $2
       where not exists (
         select 1 from public.rounding_policies where scope = 'default' and currency = 'TZS'
       )`,
      [
        'Proposed, not observed. Phase 0 found sub-cent extension errors on both ' +
          'quotations and a TZS 0.05 drift between a quotation and its invoice caused ' +
          'by rounding at the unit-price step. No stated policy exists — this draft ' +
          'rounds at line total instead, and needs an explicit decision.',
        adminId,
      ],
    )
    console.log('seeded draft charge rule, tax rule and rounding policy')

    // Brand Profile v1 — the Phase 0 extraction, held as a reviewable draft.
    const brandPayload = {
      typography: {
        primaryFont: 'Century Gothic',
        fallbackStack: ['Century Gothic', 'Questrial', 'Futura', 'sans-serif'],
        scalePoints: {
          documentTitle: 16,
          sectionHeading: 14,
          subHeading: 12,
          bodyPrimary: 10,
          bodyAlternate: 11,
          tableHeader: 9,
          denseLabel: 8.5,
          footer: 8,
          fineprint: 7,
        },
      },
      colours: {
        text: '#000000',
        secondaryText: '#595959',
        tertiaryText: '#1A1A1A',
        alert: '#FF0000',
        stampInk: '#1B3FA0',
        tableBorder: '#000000',
      },
      page: {
        size: 'A4',
        widthMm: 210,
        heightMm: 297,
        marginTopMm: 12.7,
        marginRightMm: 12.7,
        marginBottomMm: 12.7,
        marginLeftMm: 12.7,
      },
      tables: { borderWidthPt: 0.5, borderColour: '#000000', cellShading: null },
      formats: { currency: 'TZS', decimalPlaces: 2, dateFormat: 'D MONTH YYYY', dateCase: 'upper' },
      letterhead: {
        partnerMarkOrder: [
          'SEW-EURODRIVE',
          'Schneider Electric',
          'Optimised Power Products',
          'HPC Africa',
        ],
        repeatsOnEveryPage: false,
      },
      footer: {
        tagline: "Africa's Engineering Performance Benchmark",
        showsDirectors: true,
        appliesTo: ['quotation'],
      },
      standardWording: {
        termsHeading: 'TERMS AND ENGINEERING CONDITIONS',
        subHeadings: ['PAYMENT TERMS AND CONDITIONS:', 'VALUE ADDED TAX (VAT):', 'DELIVERY TIME:'],
        closing: 'We thank you for trusting us with your business.',
        signOff: 'Yours Sincerely',
        scopePrefix: 'SCOPE:',
        bankingHeading: 'Our Banking Details are:',
      },
    }

    const brandConfidence = {
      'typography.primaryFont': 'high',
      'typography.scalePoints': 'high',
      'colours.text': 'high',
      'colours.secondaryText': 'high',
      'colours.stampInk': 'medium',
      'page.margins': 'high',
      'tables.borderWidthPt': 'high',
      'letterhead.partnerMarkOrder': 'high',
      'letterhead.repeatsOnEveryPage': 'high',
      'footer.appliesTo': 'high',
      'formats.dateFormat': 'high',
    }

    await c.query(
      `insert into public.brand_profiles (version, payload, source_note, confidence, state, created_by)
       select 1, $1::jsonb, $2, $3::jsonb, 'draft', $4
       where not exists (select 1 from public.brand_profiles where version = 1)`,
      [
        JSON.stringify(brandPayload),
        'Phase 0 analysis of HQ-2670053.docx style tables, plus the PDF text layers and ' +
          'page renders of HQ_2670052 and HI_2670050 to HI_2670053. Century Gothic confirmed ' +
          'on 203 of 206 styled runs. Not approved.',
        JSON.stringify(brandConfidence),
        adminId,
      ],
    )
    console.log('seeded Brand Profile v1 as draft')

    await c.query('commit')

    const counts = await c.query<{ label: string; n: string }>(`
      select 'draft config records' as label, count(*)::text as n from (
        select state from public.legal_entities where state = 'draft'
        union all select state from public.entity_addresses where state = 'draft'
        union all select state from public.bank_accounts where state = 'draft'
        union all select state from public.numbering_rules where state = 'draft'
        union all select state from public.charge_rules where state = 'draft'
        union all select state from public.tax_rules where state = 'draft'
        union all select state from public.rounding_policies where state = 'draft'
        union all select state from public.brand_profiles where state = 'draft'
      ) d
    `)

    console.log(`\nseed complete — ${counts.rows[0]!.n} configuration records await approval`)
    console.log('No historical value has been activated. Sign in as the Administrator to review.')
  } catch (err) {
    await c.query('rollback')
    throw err
  } finally {
    await c.end()
  }
}

main().catch((err) => {
  console.error('\n' + (err instanceof Error ? err.message : String(err)))
  process.exit(1)
})

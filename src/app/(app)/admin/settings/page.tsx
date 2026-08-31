import type { Metadata } from 'next'
import { sql } from 'drizzle-orm'
import { ConfigDraftForm } from '@/components/config-draft-form'
import { ConfigReview, type ConfigRecord } from '@/components/config-review'
import { Notice, PageHeader } from '@/components/ui'
import { pageContext } from '@/lib/authz/guard'
import { hasPermission } from '@/lib/authz/roles'
import { AuthorizationError } from '@/lib/errors'

export const metadata: Metadata = { title: 'Company settings' }

/**
 * Every configurable value in one place, each with its approval state.
 *
 * The summary lines are built server-side so the client component stays a
 * renderer — it never needs to know the shape of ten different tables.
 */
export default async function SettingsPage() {
  const { records, legalEntities } = await pageContext(async (db, actor) => {
    if (!hasPermission(actor.roles, 'config.manage')) {
      throw new AuthorizationError('Company settings are managed by Administrators.')
    }

    const result = await db.execute(sql`
      select * from (
      select 'legal_entities' as table_name, id, state, notes, created_at, approved_at,
             name as summary,
             concat_ws(' · ', 'TIN ' || tin, 'VRN ' || vrn, 'BL ' || business_licence) as detail
        from public.legal_entities
      union all
      select 'entity_addresses', id, state, null, created_at, approved_at,
             label,
             concat_ws(', ', address_line1, address_line2, city)
        from public.entity_addresses
      union all
      select 'bank_accounts', id, state, notes, created_at, approved_at,
             currency || ' — ' || bank_name,
             concat_ws(' · ', account_number, branch, 'SWIFT ' || swift_code)
        from public.bank_accounts
      union all
      select 'numbering_rules', id, state, notes, created_at, approved_at,
             document_type::text,
             pattern || '  (prefix ' || prefix || ', resets ' || reset_period::text || ')'
        from public.numbering_rules
      union all
      select 'charge_rules', id, state, notes, created_at, approved_at,
             label || ' (' || trim(trailing '.' from trim(trailing '0' from rate_percent::text)) || '%)',
             case when applies_before_vat then 'Applied before VAT' else 'Applied after VAT' end
        from public.charge_rules
      union all
      select 'tax_rules', id, state, notes, created_at, approved_at,
             label || ' (' || trim(trailing '.' from trim(trailing '0' from rate_percent::text)) || '%)',
             coalesce(document_type::text, 'All document types')
        from public.tax_rules
      union all
      select 'rounding_policies', id, state, notes, created_at, approved_at,
             currency || ' rounding',
             decimal_places::text || ' decimals, ' || mode::text || ', at ' || round_at_step::text
        from public.rounding_policies
      union all
      select 'approval_policies', id, state, notes, created_at, approved_at,
             document_type::text,
             concat_ws(' · ',
               case when requires_director_approval then 'Director approval required'
                    else 'Director approval not required' end,
               case when technical_officer_may_approve then 'Technical Officer may approve' end,
               case when requires_signature then 'Signature required' end,
               case when requires_stamp then 'Stamp required' end)
        from public.approval_policies
      union all
      select 'brand_profiles', id, state, source_note, created_at, approved_at,
             'Brand Profile v' || version::text,
             (payload->'typography'->>'primaryFont') || ' · ' ||
             (payload->'page'->>'size') || ' · margins ' ||
             (payload->'page'->>'marginTopMm') || 'mm'
        from public.brand_profiles
      ) u
      order by
        case u.state when 'draft' then 0 when 'pending_approval' then 1
                     when 'approved' then 2 when 'rejected' then 3 else 4 end,
        u.table_name, u.summary
    `)

    // Offered when adding a bank account, which must belong to an entity.
    const entities = await db.execute(sql`
      select id, name, state::text as state from public.legal_entities
      where state in ('draft', 'pending_approval', 'approved')
      order by state = 'approved' desc, name`)

    return {
      records: result.rows as unknown as ConfigRecord[],
      legalEntities: entities.rows as unknown as Array<{
        id: string
        name: string
        state: string
      }>,
    }
  })

  const drafts = records.filter((r) => r.state === 'draft' || r.state === 'pending_approval')

  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="Company settings"
        description="Nothing here takes effect until you approve it. Values observed in historical documents arrive as drafts."
      />

      {drafts.length > 0 ? (
        <Notice
          tone="warn"
          title={`${drafts.length} setting${drafts.length === 1 ? '' : 's'} awaiting your decision`}
        >
          These were extracted from HA GROUP&rsquo;s own historical documents during Phase 0
          analysis. Several conflict with each other — the entity name and the numbering pattern in
          particular — so read the note on each before approving.
        </Notice>
      ) : null}

      <ConfigDraftForm legalEntities={legalEntities} />

      <ConfigReview records={records} />
    </>
  )
}

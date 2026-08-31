import type { Metadata } from 'next'
import { asc, eq } from 'drizzle-orm'
import { complianceTypes, profiles } from '@/db/schema'
import { ComplianceBoard } from '@/components/compliance-board'
import { PageHeader } from '@/components/ui'
import { pageContext } from '@/lib/authz/guard'
import { hasPermission } from '@/lib/authz/roles'
import { AuthorizationError } from '@/lib/errors'
import { loadComplianceOverview } from '@/server/compliance-actions'

export const metadata: Metadata = { title: 'Compliance' }

export default async function CompliancePage() {
  const data = await pageContext(async (db, actor) => {
    if (!hasPermission(actor.roles, 'compliance.view')) {
      throw new AuthorizationError('Compliance records are visible to staff.')
    }

    const [rows, types, people] = await Promise.all([
      loadComplianceOverview(db),
      db
        .select()
        .from(complianceTypes)
        .where(eq(complianceTypes.isActive, true))
        .orderBy(asc(complianceTypes.sortOrder)),
      db
        .select({ id: profiles.id, fullName: profiles.fullName })
        .from(profiles)
        .where(eq(profiles.isActive, true))
        .orderBy(asc(profiles.fullName)),
    ])

    return {
      rows,
      types: types.map((t) => ({ id: t.id, code: t.code, label: t.label })),
      people,
      canManage: hasPermission(actor.roles, 'compliance.manage'),
    }
  })

  const attention = data.rows.filter((r) =>
    ['expired', 'expiring_soon', 'renewal_pending', 'unknown'].includes(r.status),
  )

  return (
    <>
      <PageHeader
        eyebrow="Compliance"
        title="Licences and certificates"
        description={
          attention.length === 0
            ? 'Everything is current.'
            : `${attention.length} item${attention.length === 1 ? '' : 's'} need attention.`
        }
      />
      <ComplianceBoard {...data} />
    </>
  )
}

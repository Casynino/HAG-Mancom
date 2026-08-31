import Link from 'next/link'
import type { Metadata } from 'next'
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import {
  clients,
  engineerSubmissions,
  profiles,
  projects,
} from '@/db/schema'
import { Badge, PageHeader, Panel, PanelHeader } from '@/components/ui'
import { pageContext } from '@/lib/authz/guard'
import { hasPermission } from '@/lib/authz/roles'
import { AuthorizationError } from '@/lib/errors'
import { relativeTime, SUBMISSION_STATUS, URGENCY, type SubmissionStatus, type Urgency } from '@/lib/display'

export const metadata: Metadata = { title: 'Overview' }

/**
 * Operational overview.
 *
 * Deliberately short. The brief asks for actionable information rather than
 * analytics, so this counts what is waiting and lists what is most urgent —
 * nothing that cannot be acted on from this screen.
 */
export default async function DashboardPage() {
  const data = await pageContext(async (db, actor) => {
    if (!hasPermission(actor.roles, 'submission.view_all')) {
      throw new AuthorizationError('This overview is for the Technical Office and Directors.')
    }

    const [counts, urgent, configPending] = await Promise.all([
      db
        .select({
          status: engineerSubmissions.status,
          count: sql<number>`count(*)::int`,
        })
        .from(engineerSubmissions)
        .groupBy(engineerSubmissions.status),

      db
        .select({
          id: engineerSubmissions.id,
          reference: engineerSubmissions.reference,
          title: engineerSubmissions.title,
          status: engineerSubmissions.status,
          urgency: engineerSubmissions.urgency,
          submittedAt: engineerSubmissions.submittedAt,
          clientName: clients.legalName,
          engineerName: profiles.fullName,
        })
        .from(engineerSubmissions)
        .innerJoin(clients, eq(clients.id, engineerSubmissions.clientId))
        .innerJoin(profiles, eq(profiles.id, engineerSubmissions.submittedBy))
        .where(
          and(
            inArray(engineerSubmissions.status, ['submitted', 'under_review']),
            inArray(engineerSubmissions.urgency, ['high', 'critical']),
          ),
        )
        .orderBy(desc(engineerSubmissions.submittedAt))
        .limit(8),

      hasPermission(actor.roles, 'config.view')
        ? db.execute(sql`
            select count(*)::int as n from (
              select 1 from public.legal_entities where state = 'draft'
              union all select 1 from public.entity_addresses where state = 'draft'
              union all select 1 from public.bank_accounts where state = 'draft'
              union all select 1 from public.numbering_rules where state = 'draft'
              union all select 1 from public.charge_rules where state = 'draft'
              union all select 1 from public.tax_rules where state = 'draft'
              union all select 1 from public.rounding_policies where state = 'draft'
              union all select 1 from public.brand_profiles where state = 'draft'
            ) d`)
        : Promise.resolve({ rows: [{ n: 0 }] }),
    ])

    const byStatus = Object.fromEntries(counts.map((c) => [c.status, c.count]))

    return {
      byStatus,
      urgent,
      configPending: Number((configPending.rows[0] as { n: number } | undefined)?.n ?? 0),
      canManageConfig: hasPermission(actor.roles, 'config.manage'),
      totalOpen:
        (byStatus.submitted ?? 0) + (byStatus.under_review ?? 0) + (byStatus.changes_requested ?? 0),
    }
  })

  const tiles: Array<{ label: string; value: number; href: string; tone?: 'warn' | 'brand' }> = [
    {
      label: 'Waiting for review',
      value: data.byStatus.submitted ?? 0,
      href: '/technical',
      tone: (data.byStatus.submitted ?? 0) > 0 ? 'brand' : undefined,
    },
    { label: 'Being reviewed', value: data.byStatus.under_review ?? 0, href: '/technical' },
    {
      label: 'With the Engineer',
      value: data.byStatus.changes_requested ?? 0,
      href: '/technical',
    },
    {
      label: 'Ready for documents',
      value: data.byStatus.ready_for_documentation ?? 0,
      href: '/technical',
    },
  ]

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Operations"
        description={
          data.totalOpen === 0
            ? 'Nothing is currently open.'
            : `${data.totalOpen} submission${data.totalOpen === 1 ? '' : 's'} in progress.`
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className="rounded border border-ink-200 bg-panel p-4 transition-colors hover:border-brand-300 hover:bg-brand-50"
          >
            <p className="text-2xl font-semibold text-ink-900 tabular">{t.value}</p>
            <p className="mt-0.5 text-xs text-ink-500">{t.label}</p>
          </Link>
        ))}
      </div>

      {data.canManageConfig && data.configPending > 0 ? (
        <Link
          href="/admin/settings"
          className="block rounded border border-warn-600/25 bg-warn-50 px-4 py-3 hover:bg-warn-50/70"
        >
          <p className="text-sm font-medium text-warn-700">
            {data.configPending} company setting{data.configPending === 1 ? '' : 's'} awaiting your
            approval
          </p>
          <p className="mt-0.5 text-sm text-warn-700/80">
            Values extracted from historical documents are inert until approved. Document numbering
            and the registered entity name are among them.
          </p>
        </Link>
      ) : null}

      <Panel>
        <PanelHeader
          title="Urgent and unresolved"
          description="High and critical submissions that have not been accepted."
        />
        {data.urgent.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-ink-500 sm:px-5">
            Nothing urgent is outstanding.
          </p>
        ) : (
          <div className="divide-y divide-ink-100">
            {data.urgent.map((r) => {
              const status = SUBMISSION_STATUS[r.status as SubmissionStatus]
              const urgency = URGENCY[r.urgency as Urgency]
              return (
                <Link
                  key={r.id}
                  href={`/technical/submissions/${r.id}`}
                  className="block px-4 py-3 hover:bg-ink-50 sm:px-5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={urgency.tone}>{urgency.label}</Badge>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </div>
                  <p className="mt-1.5 font-medium text-ink-900">{r.title}</p>
                  <p className="mt-0.5 text-sm text-ink-500">
                    {r.clientName} · {r.engineerName} · {relativeTime(r.submittedAt)}
                  </p>
                </Link>
              )
            })}
          </div>
        )}
      </Panel>

      <p className="text-xs text-ink-400">
        Document approval, signature and stamp workflows arrive with the Document Engine phase. The
        approval policy and its audit trail are already in place beneath this screen.
      </p>
    </>
  )
}

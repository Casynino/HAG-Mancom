import type { Metadata } from 'next'
import { asc, eq } from 'drizzle-orm'
import { complianceTypes, profiles } from '@/db/schema'
import { ComplianceBoard } from '@/components/compliance-board'
import { AlertTriangle, CalendarClock, CircleCheck, CircleX, ShieldCheck } from 'lucide-react'
import {
  MetricCard,
  PageHeader,
  Panel,
  PanelHeader,
  Ring,
  SectionBar,
  SplitBar,
} from '@/components/ui'
import { formatDate } from '@/lib/display'
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

  const tracked = data.rows.length
  const expired = data.rows.filter((r) => r.status === 'expired').length
  const expiring = data.rows.filter((r) =>
    ['expiring_soon', 'renewal_pending'].includes(r.status),
  ).length
  const valid = data.rows.filter((r) => r.status === 'valid').length

  const unknown = data.rows.filter((r) => r.status === 'unknown').length

  /*
   * Health is measured only across certificates whose validity can actually be
   * determined — those with an expiry date on file. Counting the ones with no
   * expiry recorded as failures produced a 23% reading on a company with
   * nothing expired, which is not a hard truth, it is a wrong one. Those are
   * reported separately as needing a date, which is the real action.
   */
  const assessable = valid + expiring + expired
  const health = assessable === 0 ? 100 : Math.round((valid / assessable) * 100)
  const healthTone = expired > 0 ? 'risk' : expiring > 0 ? 'warn' : 'ok'

  // Only things that actually run out belong on a renewal timeline.
  const timeline = data.rows
    .filter((r) => r.expiresOn !== null)
    .sort((a, b) => (a.expiresOn ?? '').localeCompare(b.expiresOn ?? ''))
    .slice(0, 6)

  return (
    <>
      <PageHeader
        eyebrow="Compliance"
        title="Statutory & regulatory command"
        description="Certificates, licences and registrations, with reminders at 90, 30, 14, 7 and 1 days before expiry."
        stats={[
          { label: 'tracked', value: tracked },
          { label: 'with an expiry date', value: assessable },
          { label: 'in good standing', value: valid },
        ]}
      />

      <SectionBar
        label="Where the company stands"
        scope="Every certificate, licence and registration on record · right now"
        tone={expired > 0 ? 'risk' : expiring > 0 ? 'warn' : 'ok'}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          index={0}
          label="Tracked items"
          value={tracked}
          note={`${assessable} carry an expiry date`}
          href="#all-records"
          icon={<ShieldCheck className="size-4" aria-hidden="true" />}
        />
        <MetricCard
          index={1}
          label="Expiring soon"
          value={expiring}
          note="inside the reminder window"
          href="#all-records"
          tone={expiring > 0 ? 'warn' : 'neutral'}
          icon={<AlertTriangle className="size-4" aria-hidden="true" />}
        />
        <MetricCard
          index={2}
          label="Expired"
          value={expired}
          note={expired > 0 ? 'renew immediately' : 'none lapsed'}
          href="#all-records"
          tone={expired > 0 ? 'risk' : 'neutral'}
          icon={<CircleX className="size-4" aria-hidden="true" />}
        />
        <MetricCard
          index={3}
          label="In good standing"
          value={valid}
          note="current and verified"
          href="#all-records"
          tone="ok"
          icon={<CircleCheck className="size-4" aria-hidden="true" />}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[auto_1fr]">
        <Panel>
          <PanelHeader title="Certificate health" />
          <div className="flex flex-col items-center gap-4 p-6">
            <Ring percent={health} label={`${health}%`} sublabel="health" tone={healthTone} />
            <p className="text-center text-sm text-ink-500">
              {valid} of {assessable} assessable valid · {expired} expired · {expiring} expiring
            </p>
            {unknown > 0 ? (
              <p className="text-center text-xs text-ink-400">
                {unknown} more {unknown === 1 ? 'has' : 'have'} no expiry date recorded, so
                {unknown === 1 ? ' its' : ' their'} status cannot be judged.
              </p>
            ) : null}
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Renewal timeline"
            description="Soonest first. Items without an expiry date are not shown."
            action={<CalendarClock className="size-4 text-ink-400" aria-hidden="true" />}
          />
          {timeline.length === 0 ? (
            <p className="px-4 py-8 text-sm text-ink-500 sm:px-5">
              No certificate on file has an expiry date recorded.
            </p>
          ) : (
            <ol className="divide-y divide-ink-100">
              {timeline.map((r) => {
                const days = r.daysRemaining
                const dot =
                  r.status === 'expired'
                    ? 'bg-risk-600'
                    : r.status === 'expiring_soon' || r.status === 'renewal_pending'
                      ? 'bg-warn-600'
                      : 'bg-ok-600'
                return (
                  <li key={r.id} className="flex items-center gap-4 px-4 py-3.5 sm:px-5">
                    <span className={`size-2.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink-900">
                        {r.label}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-ink-500">
                        {[r.authority, r.responsibleName].filter(Boolean).join(' · ')}
                        {days !== null
                          ? ` · ${days < 0 ? `${Math.abs(days)} day(s) overdue` : `${days} day(s) to expiry`}`
                          : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm text-ink-600 tabular">
                      {formatDate(r.expiresOn)}
                    </span>
                  </li>
                )
              })}
            </ol>
          )}
        </Panel>
      </div>

      <div id="all-records" className="scroll-mt-24">
        <ComplianceBoard {...data} />
      </div>
    </>
  )
}

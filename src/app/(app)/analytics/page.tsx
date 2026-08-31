import type { Metadata } from 'next'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { clients, documents, engineerSubmissions } from '@/db/schema'
import { Panel, PanelHeader, PageHeader } from '@/components/ui'
import { pageContext } from '@/lib/authz/guard'
import { hasPermission } from '@/lib/authz/roles'
import { AuthorizationError } from '@/lib/errors'
import { Decimal, formatAmount } from '@/lib/finance/decimal'
import { DOCUMENT_TYPE_LABELS } from '@/lib/display'

export const metadata: Metadata = { title: 'Analytics' }

/**
 * Operational analytics.
 *
 * Every figure is aggregated in Postgres in this request. There is no chart
 * library: each of these is a proportion or a series of proportions, and a bar
 * whose width is a percentage is both smaller and more accessible than a canvas
 * a screen reader cannot enter.
 *
 * The measures were chosen because someone can act on them. "How long does a
 * document sit with the Director" changes behaviour; "documents created" does
 * not. Where there is too little data to say anything honest, the panel says so
 * rather than drawing a confident-looking line through two points.
 */

function Bar({
  label,
  value,
  max,
  hint,
  tone = 'brand',
}: {
  label: string
  value: number
  max: number
  hint?: string
  tone?: 'brand' | 'ok' | 'warn' | 'risk'
}) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100)
  const fill = {
    brand: 'bg-brand-600',
    ok: 'bg-ok-600',
    warn: 'bg-warn-600',
    risk: 'bg-risk-600',
  }[tone]

  return (
    <li className="py-3">
      <div className="flex items-baseline justify-between gap-4">
        <span className="truncate text-sm text-ink-800">{label}</span>
        <span className="shrink-0 text-sm font-medium text-ink-900 tabular">{hint ?? value}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-100">
        <div
          className={`h-full rounded-full ${fill} transition-[width] duration-700 ease-out`}
          style={{ width: `${Math.max(pct, value > 0 ? 3 : 0)}%` }}
          role="presentation"
        />
      </div>
    </li>
  )
}

export default async function AnalyticsPage() {
  const data = await pageContext(async (db, actor) => {
    if (!hasPermission(actor.roles, 'submission.view_all')) {
      throw new AuthorizationError('Analytics are for the Technical Office and Directors.')
    }

    const [byType, byStatus, byUrgency, byClient, turnaround, pipeline] = await Promise.all([
      db
        .select({
          documentType: documents.documentType,
          count: sql<number>`count(*)::int`,
          value: sql<string>`coalesce(sum(${documents.grandTotal}), 0)::text`,
        })
        .from(documents)
        .groupBy(documents.documentType),

      db
        .select({ status: documents.status, count: sql<number>`count(*)::int` })
        .from(documents)
        .groupBy(documents.status),

      db
        .select({ urgency: engineerSubmissions.urgency, count: sql<number>`count(*)::int` })
        .from(engineerSubmissions)
        .groupBy(engineerSubmissions.urgency),

      db
        .select({
          name: clients.legalName,
          count: sql<number>`count(${documents.id})::int`,
          value: sql<string>`coalesce(sum(${documents.grandTotal}), 0)::text`,
        })
        .from(clients)
        .leftJoin(documents, eq(documents.clientId, clients.id))
        .where(isNull(clients.archivedAt))
        .groupBy(clients.legalName)
        .orderBy(sql`coalesce(sum(${documents.grandTotal}), 0) desc`)
        .limit(6),

      // Median would be better than a mean on a small sample, but Postgres
      // gives us both cheaply and the count is shown so the reader can judge.
      db
        .select({
          n: sql<number>`count(*)::int`,
          avgHours: sql<string>`coalesce(round(avg(extract(epoch from (approved_at - submitted_for_approval_at)) / 3600)::numeric, 1), 0)::text`,
        })
        .from(documents)
        .where(
          and(
            inArray(documents.status, ['approved', 'issued']),
            sql`${documents.submittedForApprovalAt} is not null`,
            sql`${documents.approvedAt} is not null`,
          ),
        ),

      db
        .select({
          stage: sql<string>`case
            when ${documents.status} in ('draft','changes_requested') then 'Being prepared'
            when ${documents.status} in ('pending_review','pending_approval') then 'With the approver'
            when ${documents.status} in ('approved','issued') then 'Approved'
            else 'Closed' end`,
          count: sql<number>`count(*)::int`,
          value: sql<string>`coalesce(sum(${documents.grandTotal}), 0)::text`,
        })
        .from(documents)
        .groupBy(sql`1`),
    ])

    return { byType, byStatus, byUrgency, byClient, turnaround: turnaround[0], pipeline }
  })

  const money = (v: string) => `TZS ${formatAmount(Decimal.from(v), 0)}`
  const maxTypeCount = Math.max(1, ...data.byType.map((r) => r.count))
  const maxClientValue = Math.max(1, ...data.byClient.map((r) => Number(r.value)))
  const maxUrgency = Math.max(1, ...data.byUrgency.map((r) => r.count))

  const STAGE_ORDER = ['Being prepared', 'With the approver', 'Approved', 'Closed']
  const stages = STAGE_ORDER.map(
    (s) => data.pipeline.find((p) => p.stage === s) ?? { stage: s, count: 0, value: '0' },
  )
  const pipelineTotal = stages.reduce((n, s) => n + s.count, 0)

  const turnaroundHours = Number(data.turnaround?.avgHours ?? 0)
  const turnaroundSample = data.turnaround?.n ?? 0

  return (
    <>
      <PageHeader
        eyebrow="Analytics"
        title="How the work is actually moving"
        description="Every figure is aggregated from the records at the moment this page loads."
      />

      {/* ------------------------------- Pipeline ----------------------------- */}
      <Panel>
        <PanelHeader
          title="Document pipeline"
          description="Where every document currently sits, and what it is worth."
        />
        <div className="p-4 sm:p-5">
          {pipelineTotal === 0 ? (
            <p className="text-sm text-ink-500">No documents have been produced yet.</p>
          ) : (
            <>
              <div className="flex h-3 overflow-hidden rounded-full bg-ink-100">
                {stages.map((s, i) => {
                  const pct = (s.count / pipelineTotal) * 100
                  const fill = ['bg-ink-400', 'bg-warn-600', 'bg-ok-600', 'bg-ink-300'][i]
                  return s.count === 0 ? null : (
                    <div
                      key={s.stage}
                      className={fill}
                      style={{ width: `${pct}%` }}
                      title={`${s.stage}: ${s.count}`}
                    />
                  )
                })}
              </div>

              <dl className="mt-6 grid gap-6 sm:grid-cols-4">
                {stages.map((s, i) => (
                  <div key={s.stage}>
                    <dt className="flex items-center gap-2 text-xs text-ink-500">
                      <span
                        className={`size-2 rounded-full ${['bg-ink-400', 'bg-warn-600', 'bg-ok-600', 'bg-ink-300'][i]}`}
                        aria-hidden="true"
                      />
                      {s.stage}
                    </dt>
                    <dd className="font-display mt-1.5 text-2xl font-bold text-ink-950 tabular">
                      {s.count}
                    </dd>
                    <dd className="text-xs text-ink-500 tabular">{money(s.value)}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ---------------------------- By client ---------------------------- */}
        <Panel>
          <PanelHeader
            title="Clients by document value"
            description="Total across every document, whatever its state."
          />
          <ul className="divide-y divide-ink-100 px-4 sm:px-5">
            {data.byClient.length === 0 ? (
              <li className="py-8 text-sm text-ink-500">No clients on file.</li>
            ) : (
              data.byClient.map((c) => (
                <Bar
                  key={c.name}
                  label={c.name}
                  value={Number(c.value)}
                  max={maxClientValue}
                  hint={money(c.value)}
                  tone="brand"
                />
              ))
            )}
          </ul>
        </Panel>

        {/* ----------------------------- By type ----------------------------- */}
        <Panel>
          <PanelHeader title="Documents by type" description="What the office actually produces." />
          <ul className="divide-y divide-ink-100 px-4 sm:px-5">
            {data.byType.length === 0 ? (
              <li className="py-8 text-sm text-ink-500">Nothing produced yet.</li>
            ) : (
              data.byType.map((t) => (
                <Bar
                  key={t.documentType}
                  label={DOCUMENT_TYPE_LABELS[t.documentType] ?? t.documentType}
                  value={t.count}
                  max={maxTypeCount}
                  hint={`${t.count} · ${money(t.value)}`}
                  tone="ok"
                />
              ))
            )}
          </ul>
        </Panel>

        {/* ---------------------------- Turnaround ---------------------------- */}
        <Panel>
          <PanelHeader
            title="Approval turnaround"
            description="From submission to a Director's decision."
          />
          <div className="p-4 sm:p-5">
            {turnaroundSample === 0 ? (
              <p className="text-sm text-ink-500">
                Nothing has completed the approval round trip yet, so there is no turnaround to
                report. This fills in as documents are approved.
              </p>
            ) : (
              <>
                <p className="font-display text-4xl font-bold text-ink-950 tabular">
                  {turnaroundHours < 48
                    ? `${turnaroundHours}h`
                    : `${(turnaroundHours / 24).toFixed(1)}d`}
                </p>
                <p className="mt-1.5 text-sm text-ink-500">
                  Mean across {turnaroundSample} approved document
                  {turnaroundSample === 1 ? '' : 's'}.
                  {turnaroundSample < 5
                    ? ' Too small a sample to read a trend into — treat it as indicative.'
                    : ''}
                </p>
              </>
            )}
          </div>
        </Panel>

        {/* ----------------------------- Urgency ----------------------------- */}
        <Panel>
          <PanelHeader
            title="Site submissions by urgency"
            description="What engineers are reporting from site."
          />
          <ul className="divide-y divide-ink-100 px-4 sm:px-5">
            {data.byUrgency.length === 0 ? (
              <li className="py-8 text-sm text-ink-500">No submissions yet.</li>
            ) : (
              data.byUrgency.map((u) => (
                <Bar
                  key={u.urgency}
                  label={u.urgency.charAt(0).toUpperCase() + u.urgency.slice(1)}
                  value={u.count}
                  max={maxUrgency}
                  tone={u.urgency === 'critical' ? 'risk' : u.urgency === 'high' ? 'warn' : 'brand'}
                />
              ))
            )}
          </ul>
        </Panel>
      </div>
    </>
  )
}

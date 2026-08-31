import Link from 'next/link'
import type { Metadata } from 'next'
import { and, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm'
import {
  clients,
  complianceRecords,
  complianceTypes,
  documents,
  engineerSubmissions,
  profiles,
  projects,
} from '@/db/schema'
import { ArrowRight, FilePlus2, FileText, HardHat, ShieldCheck, Stamp } from 'lucide-react'
import { Badge, EmptyState, PageHeader, Panel, PanelHeader, StatCard } from '@/components/ui'
import { pageContext } from '@/lib/authz/guard'
import { hasPermission } from '@/lib/authz/roles'
import { AuthorizationError } from '@/lib/errors'
import { Decimal, formatAmount } from '@/lib/finance/decimal'
import {
  DOCUMENT_STATUS,
  DOCUMENT_TYPE_LABELS,
  formatDate,
  relativeTime,
  SUBMISSION_STATUS,
  URGENCY,
  type SubmissionStatus,
  type Urgency,
} from '@/lib/display'

export const metadata: Metadata = { title: 'Operations Command Centre' }

/**
 * The command centre.
 *
 * It answers four questions in the order somebody actually asks them on
 * arriving at work: what is waiting on me, what is moving, what is at risk, and
 * what can I start. Every figure is computed from the records in the same
 * request that renders them — nothing is a stored counter that could drift from
 * what the tables actually say — and every figure links to the thing it counts,
 * because a number demanding attention should take you to it.
 *
 * Deliberately absent: vanity totals. "Documents issued this year" tells a
 * Technical Officer nothing they can act on before lunch.
 */

function greeting(hour: number) {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export default async function DashboardPage() {
  const data = await pageContext(async (db, actor) => {
    if (!hasPermission(actor.roles, 'submission.view_all')) {
      throw new AuthorizationError('This overview is for the Technical Office and Directors.')
    }

    const today = new Date()
    const todayIso = today.toISOString().slice(0, 10)
    const in90 = new Date(today.getTime() + 90 * 86_400_000).toISOString().slice(0, 10)
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

    const [
      submissionCounts,
      documentCounts,
      approvedValue,
      recentDocuments,
      latestSubmissions,
      expiring,
      approvedThisMonth,
      activeProjects,
    ] = await Promise.all([
      db
        .select({ status: engineerSubmissions.status, count: sql<number>`count(*)::int` })
        .from(engineerSubmissions)
        .groupBy(engineerSubmissions.status),

      db
        .select({ status: documents.status, count: sql<number>`count(*)::int` })
        .from(documents)
        .groupBy(documents.status),

      // Only what a Director has actually signed off. A draft total is a guess.
      db
        .select({ total: sql<string>`coalesce(sum(${documents.grandTotal}), 0)::text` })
        .from(documents)
        .where(
          and(
            inArray(documents.status, ['approved', 'issued']),
            inArray(documents.documentType, ['quotation', 'tax_invoice']),
          ),
        ),

      db
        .select({
          id: documents.id,
          reference: documents.reference,
          documentType: documents.documentType,
          title: documents.title,
          status: documents.status,
          currency: documents.currency,
          grandTotal: documents.grandTotal,
          updatedAt: documents.updatedAt,
          clientName: clients.legalName,
        })
        .from(documents)
        .innerJoin(clients, eq(clients.id, documents.clientId))
        .orderBy(desc(documents.updatedAt))
        .limit(5),

      db
        .select({
          id: engineerSubmissions.id,
          title: engineerSubmissions.title,
          problem: engineerSubmissions.problemDescription,
          status: engineerSubmissions.status,
          urgency: engineerSubmissions.urgency,
          submittedAt: engineerSubmissions.submittedAt,
          clientName: clients.legalName,
          engineerName: profiles.fullName,
        })
        .from(engineerSubmissions)
        .innerJoin(clients, eq(clients.id, engineerSubmissions.clientId))
        .innerJoin(profiles, eq(profiles.id, engineerSubmissions.submittedBy))
        .where(inArray(engineerSubmissions.status, ['submitted', 'under_review']))
        .orderBy(desc(engineerSubmissions.submittedAt))
        .limit(4),

      db
        .select({
          id: complianceRecords.id,
          label: complianceTypes.label,
          authority: complianceTypes.authority,
          expiresOn: complianceRecords.expiresOn,
        })
        .from(complianceRecords)
        .innerJoin(complianceTypes, eq(complianceTypes.id, complianceRecords.complianceTypeId))
        .where(
          and(
            isNull(complianceRecords.supersededAt),
            lte(complianceRecords.expiresOn, in90),
            gte(complianceRecords.expiresOn, todayIso),
          ),
        )
        .orderBy(complianceRecords.expiresOn)
        .limit(4),

      db
        .select({ count: sql<number>`count(*)::int` })
        .from(documents)
        .where(
          and(
            inArray(documents.status, ['approved', 'issued']),
            gte(documents.approvedAt, monthStart),
          ),
        ),

      db
        .select({ count: sql<number>`count(*)::int` })
        .from(projects)
        .where(and(eq(projects.status, 'active'), isNull(projects.archivedAt))),
    ])

    const total = (rows: Array<{ status: string; count: number }>, ...want: string[]) =>
      rows.filter((r) => want.includes(r.status)).reduce((n, r) => n + r.count, 0)

    return {
      actorName: actor.fullName,
      awaitingApproval: total(documentCounts, 'pending_approval', 'pending_review'),
      openWorkRequests: total(submissionCounts, 'submitted', 'under_review'),
      documentsIssued: total(documentCounts, 'approved', 'issued'),
      approvedValue: approvedValue[0]?.total ?? '0',
      approvedThisMonth: approvedThisMonth[0]?.count ?? 0,
      activeProjects: activeProjects[0]?.count ?? 0,
      recentDocuments,
      latestSubmissions,
      expiring,
      canCreateDocument: hasPermission(actor.roles, 'document.create'),
      canSubmit: hasPermission(actor.roles, 'submission.create'),
    }
  })

  const now = new Date()

  return (
    <>
      <PageHeader
        eyebrow={`${greeting(now.getHours())}, ${data.actorName.split(' ')[0]}`}
        title="Operations Command Centre"
        description="Live status of site inspections, documentation, approvals and statutory compliance."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <span className="hidden rounded-lg border border-ink-200 bg-panel px-3 py-2 text-sm text-ink-600 tabular sm:inline-block">
              {formatDate(now.toISOString().slice(0, 10))}
            </span>
            {data.canSubmit ? (
              <Link
                href="/engineer/new"
                className="tap inline-flex items-center gap-2 rounded-lg border border-ink-300 bg-panel px-4 text-sm font-medium text-ink-800 hover:bg-ink-50"
              >
                <HardHat className="size-4" aria-hidden="true" />
                New work request
              </Link>
            ) : null}
            {data.canCreateDocument ? (
              <Link
                href="/technical/studio"
                className="tap btn-primary inline-flex items-center gap-2 rounded-lg px-4 text-sm font-medium"
              >
                <FilePlus2 className="size-4" aria-hidden="true" />
                Generate document
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Awaiting approval"
          value={data.awaitingApproval}
          meta="With the Director"
          href="/approvals"
          tone={data.awaitingApproval > 0 ? 'warn' : 'neutral'}
          icon={<Stamp className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Open work requests"
          value={data.openWorkRequests}
          meta="From site engineers"
          href="/technical"
          tone={data.openWorkRequests > 0 ? 'brand' : 'neutral'}
          icon={<HardHat className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Documents issued"
          value={data.documentsIssued}
          meta={`${data.activeProjects} active project${data.activeProjects === 1 ? '' : 's'}`}
          href="/repository"
          icon={<FileText className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Approved value"
          value={`TZS ${formatAmount(Decimal.from(data.approvedValue), 0)}`}
          meta={`${data.approvedThisMonth} approved this month`}
          href="/technical/documents"
          tone="ok"
          icon={<ShieldCheck className="size-4" aria-hidden="true" />}
        />
      </div>

      {data.expiring.length > 0 ? (
        <Panel className="border-warn-600/30 bg-warn-50">
          <div className="flex flex-wrap items-start gap-4 p-4 sm:p-5">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-warn-700" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-warn-700">
                {data.expiring.length} certificate{data.expiring.length === 1 ? '' : 's'} expire
                within 90 days
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {data.expiring.map((e) => (
                  <li key={e.id} className="text-sm text-ink-700">
                    {e.label}
                    {e.authority ? <span className="text-ink-500"> · {e.authority}</span> : null}
                    <span className="text-ink-500"> · expires {formatDate(e.expiresOn)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <Link
              href="/compliance"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-warn-700 hover:underline"
            >
              Review
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Panel>
          <PanelHeader
            title="Recent documents"
            description="Newest first, whatever their state."
            action={
              <Link
                href="/repository"
                className="text-sm font-medium text-brand-700 hover:underline"
              >
                All documents
              </Link>
            }
          />
          {data.recentDocuments.length === 0 ? (
            <EmptyState
              title="Nothing produced yet"
              description="Start one in the AI Document Studio, or accept a site visit and draft a quotation from it."
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {data.recentDocuments.map((d) => {
                const status = DOCUMENT_STATUS[d.status] ?? {
                  label: d.status,
                  tone: 'neutral' as const,
                }
                return (
                  <li key={d.id}>
                    <Link
                      href={`/technical/documents/${d.id}`}
                      className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-ink-50 sm:px-5"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-ink-50 text-ink-400">
                        <FileText className="size-4" aria-hidden="true" />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink-900">
                          {d.title}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-ink-500">
                          {d.reference ?? 'Not yet numbered'} · {d.clientName} ·{' '}
                          {DOCUMENT_TYPE_LABELS[d.documentType] ?? d.documentType}
                        </span>
                      </span>

                      <span className="hidden shrink-0 text-right sm:block">
                        {d.grandTotal ? (
                          <span className="block text-sm font-medium text-ink-900 tabular">
                            {d.currency} {formatAmount(Decimal.from(d.grandTotal), 0)}
                          </span>
                        ) : null}
                        <span className="block text-xs text-ink-400">
                          {relativeTime(d.updatedAt)}
                        </span>
                      </span>

                      <Badge tone={status.tone}>{status.label}</Badge>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        <Panel>
          <PanelHeader
            title="Latest site submissions"
            description="Waiting on the Technical Office."
            action={
              <Link href="/technical" className="text-sm font-medium text-brand-700 hover:underline">
                Queue
              </Link>
            }
          />
          {data.latestSubmissions.length === 0 ? (
            <EmptyState
              title="The queue is empty"
              description="Nothing is waiting to be reviewed."
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {data.latestSubmissions.map((s) => {
                const urgency = URGENCY[s.urgency as Urgency]
                const status = SUBMISSION_STATUS[s.status as SubmissionStatus]
                return (
                  <li key={s.id}>
                    <Link
                      href={`/technical/submissions/${s.id}`}
                      className="block px-4 py-3.5 transition-colors hover:bg-ink-50 sm:px-5"
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="flex-1 truncate text-sm font-medium text-ink-900">
                          {s.clientName}
                        </span>
                        <Badge tone={urgency.tone}>{urgency.label}</Badge>
                      </span>
                      <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-ink-500">
                        {s.problem}
                      </span>
                      <span className="mt-1.5 block text-xs text-ink-400">
                        {s.engineerName} · {status.label} · {relativeTime(s.submittedAt)}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      </div>
    </>
  )
}

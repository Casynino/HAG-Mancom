import Link from 'next/link'
import type { Metadata } from 'next'
import { asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { clients, documents, engineerSubmissions, profiles, projects } from '@/db/schema'
import { FileText, HardHat, Sparkles, Stamp } from 'lucide-react'
import { Badge, EmptyState, PageHeader, Panel } from '@/components/ui'
import { pageContext } from '@/lib/authz/guard'
import { hasPermission } from '@/lib/authz/roles'
import { AuthorizationError } from '@/lib/errors'
import { Decimal, formatAmount } from '@/lib/finance/decimal'
import {
  DOCUMENT_STATUS,
  DOCUMENT_TYPE_LABELS,
  relativeTime,
  SUBMISSION_STATUS,
  URGENCY,
  type SubmissionStatus,
  type Urgency,
} from '@/lib/display'

export const metadata: Metadata = { title: 'Operational Control Centre' }

/** Critical first, then oldest — so nothing urgent hides behind newer work. */
const URGENCY_RANK = sql`case ${engineerSubmissions.urgency}
  when 'critical' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`

type Tab = 'inbox' | 'drafts' | 'director'

/**
 * The Technical Office's own screen.
 *
 * Three tabs, because the office's day has three distinct piles and mixing them
 * hides the one that matters: what has come in from site, what is half-written
 * on the desk, and what has gone up for a decision and is out of their hands.
 *
 * The tab lives in the URL rather than in component state. It costs nothing and
 * means a Technical Officer can send a colleague a link to the pile they mean.
 */
export default async function TechnicalQueue({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab: requested } = await searchParams
  const tab: Tab =
    requested === 'drafts' ? 'drafts' : requested === 'director' ? 'director' : 'inbox'

  const data = await pageContext(async (db, actor) => {
    if (!hasPermission(actor.roles, 'submission.view_all')) {
      throw new AuthorizationError('This is the Technical Office queue.')
    }

    const [submissions, docs] = await Promise.all([
      db
        .select({
          id: engineerSubmissions.id,
          title: engineerSubmissions.title,
          problem: engineerSubmissions.problemDescription,
          recommended: engineerSubmissions.recommendedWork,
          status: engineerSubmissions.status,
          urgency: engineerSubmissions.urgency,
          submittedAt: engineerSubmissions.submittedAt,
          engineerName: profiles.fullName,
          projectLocation: projects.location,
          clientName: clients.legalName,
        })
        .from(engineerSubmissions)
        .innerJoin(projects, eq(projects.id, engineerSubmissions.projectId))
        .innerJoin(clients, eq(clients.id, engineerSubmissions.clientId))
        .innerJoin(profiles, eq(profiles.id, engineerSubmissions.submittedBy))
        .where(
          inArray(engineerSubmissions.status, [
            'submitted',
            'under_review',
            'changes_requested',
            'accepted',
            'ready_for_documentation',
          ]),
        )
        .orderBy(URGENCY_RANK, asc(engineerSubmissions.submittedAt))
        .limit(100),

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
          submittedForApprovalAt: documents.submittedForApprovalAt,
        })
        .from(documents)
        .where(
          inArray(documents.status, [
            'draft',
            'changes_requested',
            'rejected',
            'pending_review',
            'pending_approval',
          ]),
        )
        .orderBy(desc(documents.updatedAt))
        .limit(100),
    ])

    return {
      inbox: submissions.filter((s) => ['submitted', 'under_review'].includes(s.status)),
      accepted: submissions.filter((s) =>
        ['accepted', 'ready_for_documentation', 'changes_requested'].includes(s.status),
      ),
      drafts: docs.filter((d) => ['draft', 'changes_requested', 'rejected'].includes(d.status)),
      withDirector: docs.filter((d) => ['pending_review', 'pending_approval'].includes(d.status)),
      canCreateDocument: hasPermission(actor.roles, 'document.create'),
    }
  })

  const tabs: Array<{ key: Tab; label: string; count: number }> = [
    { key: 'inbox', label: 'Site inbox', count: data.inbox.length },
    { key: 'drafts', label: 'Drafts', count: data.drafts.length },
    { key: 'director', label: 'With the Director', count: data.withDirector.length },
  ]

  return (
    <>
      <PageHeader
        eyebrow="Technical Office"
        title="Operational Control Centre"
        description="Review what came in from site, turn it into a document, and track it through approval."
        stats={[
          { label: 'in from site', value: data.inbox.length },
          { label: 'on the desk', value: data.drafts.length },
          { label: 'with the Director', value: data.withDirector.length },
        ]}
        action={
          data.canCreateDocument ? (
            <Link
              href="/technical/studio"
              className="tap btn-primary inline-flex items-center gap-2 rounded-lg px-4 text-sm font-medium"
            >
              <Sparkles className="size-4" aria-hidden="true" />
              AI Document Studio
            </Link>
          ) : null
        }
      />

      <nav
        aria-label="Queue"
        className="flex flex-wrap gap-1 rounded-lg border border-ink-200 bg-panel p-1"
      >
        {tabs.map((t) => {
          const active = t.key === tab
          return (
            <Link
              key={t.key}
              href={t.key === 'inbox' ? '/technical' : `/technical?tab=${t.key}`}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm transition-colors ${
                active
                  ? 'bg-ink-100 font-medium text-ink-900'
                  : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'
              }`}
            >
              {t.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[11px] tabular ${
                  active ? 'bg-panel text-ink-700' : 'bg-ink-100 text-ink-500'
                }`}
              >
                {t.count}
              </span>
            </Link>
          )
        })}
      </nav>

      {tab === 'inbox' ? (
        data.inbox.length === 0 ? (
          <Panel>
            <EmptyState
              title="Nothing waiting from site"
              description="Submissions appear here the moment an Engineer files one."
            />
          </Panel>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {data.inbox.map((s) => {
              const urgency = URGENCY[s.urgency as Urgency]
              const status = SUBMISSION_STATUS[s.status as SubmissionStatus]
              return (
                <Panel key={s.id} className="flex flex-col">
                  <div className="flex flex-wrap items-start gap-2 p-4 pb-0 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink-900">{s.clientName}</p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {s.engineerName} · {relativeTime(s.submittedAt)}
                      </p>
                    </div>
                    <Badge tone={urgency.tone}>{urgency.label}</Badge>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </div>

                  <div className="flex-1 p-4 sm:px-5">
                    <p className="text-sm leading-relaxed text-ink-800">{s.problem}</p>
                    <p className="mt-2 text-sm leading-relaxed text-ink-500">
                      <span className="font-medium text-ink-600">Recommended:</span> {s.recommended}
                    </p>
                    {s.projectLocation ? (
                      <p className="mt-3 text-xs text-ink-400">{s.projectLocation}</p>
                    ) : null}
                  </div>

                  <div className="border-t border-ink-100 p-3 sm:px-5">
                    <Link
                      href={`/technical/submissions/${s.id}`}
                      className="tap btn-primary inline-flex items-center gap-2 rounded-lg px-4 text-sm font-medium"
                    >
                      <HardHat className="size-4" aria-hidden="true" />
                      Review it
                    </Link>
                  </div>
                </Panel>
              )
            })}
          </div>
        )
      ) : null}

      {tab === 'drafts' ? (
        data.drafts.length === 0 ? (
          <Panel>
            <EmptyState
              title="No drafts on the desk"
              description="Start one in the AI Document Studio, or accept a site visit and draft a quotation from it."
            />
          </Panel>
        ) : (
          <Panel className="divide-y divide-ink-100">
            {data.drafts.map((d) => (
              <DocumentRow key={d.id} doc={d} />
            ))}
          </Panel>
        )
      ) : null}

      {tab === 'director' ? (
        data.withDirector.length === 0 ? (
          <Panel>
            <EmptyState
              title="Nothing is with the Director"
              description="Documents appear here once you submit them for approval."
            />
          </Panel>
        ) : (
          <Panel className="divide-y divide-ink-100">
            {data.withDirector.map((d) => (
              <DocumentRow key={d.id} doc={d} waiting />
            ))}
          </Panel>
        )
      ) : null}

      {/* Accepted visits bridge the two halves of this screen. */}
      {tab === 'inbox' && data.accepted.length > 0 ? (
        <Panel>
          <div className="border-b border-ink-100 px-4 py-3 sm:px-5">
            <p className="text-sm font-medium text-ink-900">Accepted, waiting to be written up</p>
            <p className="mt-0.5 text-xs text-ink-500">
              These have been reviewed. Draft a quotation from one to move it on.
            </p>
          </div>
          <ul className="divide-y divide-ink-100">
            {data.accepted.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/technical/submissions/${s.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-ink-50 sm:px-5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink-900">{s.title}</span>
                    <span className="block truncate text-xs text-ink-500">{s.clientName}</span>
                  </span>
                  <Badge tone={SUBMISSION_STATUS[s.status as SubmissionStatus].tone}>
                    {SUBMISSION_STATUS[s.status as SubmissionStatus].label}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </>
  )
}

function DocumentRow({
  doc,
  waiting = false,
}: {
  doc: {
    id: string
    reference: string | null
    documentType: string
    title: string
    status: string
    currency: string
    grandTotal: string | null
    updatedAt: Date
    submittedForApprovalAt: Date | null
  }
  waiting?: boolean
}) {
  const status = DOCUMENT_STATUS[doc.status] ?? { label: doc.status, tone: 'neutral' as const }

  return (
    <Link
      href={`/technical/documents/${doc.id}`}
      className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-ink-50 sm:px-5"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-ink-50 text-ink-400">
        {waiting ? (
          <Stamp className="size-4" aria-hidden="true" />
        ) : (
          <FileText className="size-4" aria-hidden="true" />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink-900">{doc.title}</span>
        <span className="mt-0.5 block truncate text-xs text-ink-500">
          {doc.reference ?? 'Not yet numbered'} ·{' '}
          {DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType} ·{' '}
          {waiting
            ? `sent ${relativeTime(doc.submittedForApprovalAt)}`
            : `edited ${relativeTime(doc.updatedAt)}`}
        </span>
      </span>

      {doc.grandTotal ? (
        <span className="hidden shrink-0 text-sm font-medium text-ink-900 tabular sm:block">
          {doc.currency} {formatAmount(Decimal.from(doc.grandTotal), 0)}
        </span>
      ) : null}

      <Badge tone={status.tone}>{status.label}</Badge>
    </Link>
  )
}

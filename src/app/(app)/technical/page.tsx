import Link from 'next/link'
import type { Metadata } from 'next'
import { asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { clients, engineerSubmissions, profiles, projects } from '@/db/schema'
import { Badge, EmptyState, PageHeader, Panel } from '@/components/ui'
import { pageContext } from '@/lib/authz/guard'
import { hasPermission } from '@/lib/authz/roles'
import { AuthorizationError } from '@/lib/errors'
import {
  relativeTime,
  SUBMISSION_STATUS,
  URGENCY,
  type SubmissionStatus,
  type Urgency,
} from '@/lib/display'

export const metadata: Metadata = { title: 'Review queue' }

/** Critical first, then oldest — so nothing urgent hides behind newer work. */
const URGENCY_RANK = sql`case ${engineerSubmissions.urgency}
  when 'critical' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`

export default async function TechnicalQueue() {
  const { waiting, inReview, returned, ready } = await pageContext(async (db, actor) => {
    if (!hasPermission(actor.roles, 'submission.view_all')) {
      throw new AuthorizationError('This is the Technical Office queue.')
    }

    const rows = await db
      .select({
        id: engineerSubmissions.id,
        reference: engineerSubmissions.reference,
        title: engineerSubmissions.title,
        status: engineerSubmissions.status,
        urgency: engineerSubmissions.urgency,
        submittedAt: engineerSubmissions.submittedAt,
        updatedAt: engineerSubmissions.updatedAt,
        revision: engineerSubmissions.revision,
        engineerName: profiles.fullName,
        projectName: projects.name,
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
      .orderBy(
        URGENCY_RANK,
        asc(engineerSubmissions.submittedAt),
        desc(engineerSubmissions.updatedAt),
      )
      .limit(200)

    return {
      waiting: rows.filter((r) => r.status === 'submitted'),
      inReview: rows.filter((r) => r.status === 'under_review'),
      returned: rows.filter((r) => r.status === 'changes_requested'),
      ready: rows.filter((r) => r.status === 'accepted' || r.status === 'ready_for_documentation'),
    }
  })

  const total = waiting.length + inReview.length

  return (
    <>
      <PageHeader
        eyebrow="Technical Office"
        title="Review queue"
        description={
          total === 0
            ? 'Nothing is waiting on you.'
            : `${total} submission${total === 1 ? '' : 's'} need your attention, most urgent first.`
        }
      />

      {waiting.length === 0 &&
      inReview.length === 0 &&
      returned.length === 0 &&
      ready.length === 0 ? (
        <Panel>
          <EmptyState
            title="The queue is empty"
            description="Submissions from Engineers in the field will appear here as soon as they are filed."
          />
        </Panel>
      ) : null}

      {waiting.length > 0 ? <Queue title="Waiting to be picked up" rows={waiting} /> : null}
      {inReview.length > 0 ? <Queue title="You are reviewing" rows={inReview} /> : null}
      {returned.length > 0 ? (
        <Queue title="Returned to the Engineer" rows={returned} muted />
      ) : null}
      {ready.length > 0 ? <Queue title="Accepted" rows={ready} muted /> : null}
    </>
  )
}

type Row = {
  id: string
  reference: string | null
  title: string
  status: string
  urgency: string
  submittedAt: Date | null
  updatedAt: Date
  revision: number
  engineerName: string
  projectName: string
  clientName: string
}

function Queue({ title, rows, muted }: { title: string; rows: Row[]; muted?: boolean }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h2 className="text-xs font-semibold tracking-wider text-ink-500 uppercase">{title}</h2>
        <span className="text-xs text-ink-400 tabular">{rows.length}</span>
      </div>
      <Panel className="divide-y divide-ink-100">
        {rows.map((row) => {
          const status = SUBMISSION_STATUS[row.status as SubmissionStatus]
          const urgency = URGENCY[row.urgency as Urgency]
          return (
            <Link
              key={row.id}
              href={`/technical/submissions/${row.id}`}
              className={`block px-4 py-3.5 transition-colors hover:bg-ink-50 sm:px-5 ${muted ? 'opacity-70' : ''}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={urgency.tone}>{urgency.label}</Badge>
                <Badge tone={status.tone}>{status.label}</Badge>
                {row.revision > 1 ? <Badge tone="neutral">Revision {row.revision}</Badge> : null}
                {row.reference ? (
                  <span className="font-mono text-xs text-ink-400 tabular">{row.reference}</span>
                ) : null}
              </div>

              <p className="mt-1.5 font-medium text-ink-900">{row.title}</p>
              <p className="mt-0.5 text-sm text-ink-500">
                {row.clientName} · {row.projectName}
              </p>
              <p className="mt-1.5 text-xs text-ink-400">
                {row.engineerName} ·{' '}
                {row.submittedAt
                  ? `filed ${relativeTime(row.submittedAt)}`
                  : `updated ${relativeTime(row.updatedAt)}`}
              </p>
            </Link>
          )
        })}
      </Panel>
    </section>
  )
}

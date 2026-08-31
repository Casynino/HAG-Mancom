import Link from 'next/link'
import type { Metadata } from 'next'
import { desc, eq } from 'drizzle-orm'
import { clients, engineerSubmissions, projects } from '@/db/schema'
import { Badge, EmptyState, PageHeader, Panel } from '@/components/ui'
import { pageContext } from '@/lib/authz/guard'
import { hasPermission } from '@/lib/authz/roles'
import {
  relativeTime,
  SUBMISSION_STATUS,
  URGENCY,
  type SubmissionStatus,
  type Urgency,
} from '@/lib/display'

export const metadata: Metadata = { title: 'My site work' }

export default async function EngineerHome() {
  const { rows, canCreate } = await pageContext(async (db, actor) => {
    const result = await db
      .select({
        id: engineerSubmissions.id,
        reference: engineerSubmissions.reference,
        title: engineerSubmissions.title,
        status: engineerSubmissions.status,
        urgency: engineerSubmissions.urgency,
        updatedAt: engineerSubmissions.updatedAt,
        submittedAt: engineerSubmissions.submittedAt,
        correctionComment: engineerSubmissions.correctionComment,
        projectName: projects.name,
        clientName: clients.legalName,
      })
      .from(engineerSubmissions)
      .innerJoin(projects, eq(projects.id, engineerSubmissions.projectId))
      .innerJoin(clients, eq(clients.id, engineerSubmissions.clientId))
      .where(eq(engineerSubmissions.submittedBy, actor.id))
      .orderBy(desc(engineerSubmissions.updatedAt))
      .limit(100)

    return {
      rows: result,
      canCreate: hasPermission(actor.roles, 'submission.create'),
    }
  })

  const needsAttention = rows.filter(
    (r) => r.status === 'changes_requested' || r.status === 'draft',
  )
  const inProgress = rows.filter((r) => r.status === 'submitted' || r.status === 'under_review')
  const closed = rows.filter((r) =>
    ['accepted', 'ready_for_documentation', 'cancelled'].includes(r.status),
  )

  return (
    <>
      <PageHeader
        eyebrow="Engineer"
        title="My site work"
        description="Everything you have filed, and anything waiting on you."
        stats={[
          { label: 'filed', value: rows.length },
          { label: 'moving', value: inProgress.length },
          { label: 'need you', value: needsAttention.length },
        ]}
        action={
          canCreate ? (
            <Link
              href="/engineer/new"
              className="tap hidden items-center btn-primary rounded-lg px-4 text-sm font-medium text-white sm:inline-flex"
            >
              New site submission
            </Link>
          ) : null
        }
      />

      {canCreate ? (
        <Link
          href="/engineer/new"
          className="tap-lg flex items-center justify-center btn-primary rounded-lg px-5 font-medium text-white sm:hidden"
        >
          New site submission
        </Link>
      ) : null}

      {rows.length === 0 ? (
        <Panel>
          <EmptyState
            title="Nothing filed yet"
            description="When you visit a site, record what you found here. It takes a minute and goes straight to the Technical Officer."
            action={
              canCreate ? (
                <Link
                  href="/engineer/new"
                  className="tap inline-flex items-center btn-primary rounded-lg px-4 text-sm font-medium text-white"
                >
                  Start a submission
                </Link>
              ) : null
            }
          />
        </Panel>
      ) : null}

      {needsAttention.length > 0 ? (
        <Section title="Needs you" rows={needsAttention} highlight />
      ) : null}
      {inProgress.length > 0 ? (
        <Section title="With the Technical Office" rows={inProgress} />
      ) : null}
      {closed.length > 0 ? <Section title="Closed" rows={closed} /> : null}
    </>
  )
}

type Row = {
  id: string
  reference: string | null
  title: string
  status: string
  urgency: string
  updatedAt: Date
  submittedAt: Date | null
  correctionComment: string | null
  projectName: string
  clientName: string
}

function Section({ title, rows, highlight }: { title: string; rows: Row[]; highlight?: boolean }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold tracking-wider text-ink-500 uppercase">{title}</h2>
      <Panel className="divide-y divide-ink-100">
        {rows.map((row) => {
          const status = SUBMISSION_STATUS[row.status as SubmissionStatus]
          const urgency = URGENCY[row.urgency as Urgency]
          return (
            <Link
              key={row.id}
              href={`/engineer/submissions/${row.id}`}
              className="block px-4 py-3.5 transition-colors hover:bg-ink-50 sm:px-5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={status.tone}>{status.engineerLabel}</Badge>
                {row.urgency !== 'normal' && row.urgency !== 'low' ? (
                  <Badge tone={urgency.tone}>{urgency.label}</Badge>
                ) : null}
                {row.reference ? (
                  <span className="font-mono text-xs text-ink-400 tabular">{row.reference}</span>
                ) : null}
              </div>

              <p className="mt-1.5 font-medium text-ink-900">{row.title}</p>
              <p className="mt-0.5 text-sm text-ink-500">
                {row.clientName} · {row.projectName}
              </p>

              {highlight && row.correctionComment ? (
                <p className="mt-2 rounded border border-warn-600/25 bg-warn-50 px-2.5 py-1.5 text-sm text-warn-700">
                  {row.correctionComment}
                </p>
              ) : null}

              <p className="mt-1.5 text-xs text-ink-400">
                {row.submittedAt
                  ? `Submitted ${relativeTime(row.submittedAt)}`
                  : `Edited ${relativeTime(row.updatedAt)}`}
              </p>
            </Link>
          )
        })}
      </Panel>
    </section>
  )
}

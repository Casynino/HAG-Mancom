import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { and, asc, eq, isNull, ne } from 'drizzle-orm'
import {
  clients,
  engineerSubmissions,
  projectMembers,
  projects,
  submissionAttachments,
  submissionEvents,
  submissionMeasurements,
} from '@/db/schema'
import { AttachmentManager } from '@/components/attachment-manager'
import { SubmissionForm } from '@/components/submission-form'
import { SubmitSubmissionPanel } from '@/components/submit-submission-panel'
import { Badge, DescriptionList, Notice, PageHeader, Panel, PanelHeader } from '@/components/ui'
import { pageContext } from '@/lib/authz/guard'
import {
  formatDate,
  formatDateTime,
  SUBMISSION_STATUS,
  URGENCY,
  type SubmissionStatus,
  type Urgency,
} from '@/lib/display'

export const metadata: Metadata = { title: 'Site submission' }

export default async function SubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const data = await pageContext(async (db, actor) => {
    const [submission] = await db
      .select({
        s: engineerSubmissions,
        projectName: projects.name,
        projectRef: projects.reference,
        clientName: clients.legalName,
      })
      .from(engineerSubmissions)
      .innerJoin(projects, eq(projects.id, engineerSubmissions.projectId))
      .innerJoin(clients, eq(clients.id, engineerSubmissions.clientId))
      .where(eq(engineerSubmissions.id, id))
      .limit(1)

    if (!submission) return null

    const [measurements, attachments, events, assignedProjects] = await Promise.all([
      db
        .select()
        .from(submissionMeasurements)
        .where(eq(submissionMeasurements.submissionId, id))
        .orderBy(asc(submissionMeasurements.position)),
      db
        .select()
        .from(submissionAttachments)
        .where(
          and(eq(submissionAttachments.submissionId, id), isNull(submissionAttachments.deletedAt)),
        )
        .orderBy(asc(submissionAttachments.uploadedAt)),
      db
        .select()
        .from(submissionEvents)
        .where(eq(submissionEvents.submissionId, id))
        .orderBy(asc(submissionEvents.createdAt)),
      db
        .select({
          id: projects.id,
          name: projects.name,
          reference: projects.reference,
          clientName: clients.legalName,
        })
        .from(projectMembers)
        .innerJoin(projects, eq(projects.id, projectMembers.projectId))
        .innerJoin(clients, eq(clients.id, projects.clientId))
        .where(
          and(
            eq(projectMembers.userId, actor.id),
            isNull(projectMembers.removedAt),
            ne(projects.status, 'archived'),
          ),
        )
        .orderBy(asc(clients.legalName)),
    ])

    return {
      ...submission,
      measurements,
      attachments,
      events,
      assignedProjects,
      isAuthor: submission.s.submittedBy === actor.id,
    }
  })

  if (!data) notFound()

  const s = data.s
  const status = SUBMISSION_STATUS[s.status as SubmissionStatus]
  const urgency = URGENCY[s.urgency as Urgency]
  const editable = data.isAuthor && (s.status === 'draft' || s.status === 'changes_requested')

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/engineer" className="hover:underline">
            ← My site work
          </Link>
        }
        title={s.title}
        description={`${data.clientName} · ${data.projectName} (${data.projectRef})`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={status.tone}>{status.engineerLabel}</Badge>
            <Badge tone={urgency.tone}>{urgency.label}</Badge>
          </div>
        }
      />

      {s.reference ? (
        <p className="font-mono text-sm text-ink-500 tabular">
          {s.reference}
          {s.revision > 1 ? ` · revision ${s.revision}` : ''}
        </p>
      ) : null}

      {s.status === 'changes_requested' && s.correctionComment ? (
        <Notice tone="warn" title="The Technical Officer asked for a correction">
          {s.correctionComment}
        </Notice>
      ) : null}

      {editable ? (
        <SubmissionForm
          submissionId={s.id}
          projects={data.assignedProjects}
          initial={{
            projectId: s.projectId,
            title: s.title,
            problemDescription: s.problemDescription,
            recommendedWork: s.recommendedWork,
            urgency: s.urgency,
            siteVisitDate: s.siteVisitDate ?? '',
            gpsLatitude: s.gpsLatitude ?? '',
            gpsLongitude: s.gpsLongitude ?? '',
            gpsAccuracyMetres: s.gpsAccuracyMetres ?? '',
            measurements: data.measurements.map((m) => ({
              label: m.label,
              value: m.value,
              unit: m.unit,
              notes: m.notes ?? undefined,
            })),
          }}
        />
      ) : (
        <>
          <Panel>
            <PanelHeader title="What you filed" />
            <div className="px-4 sm:px-5">
              <DescriptionList
                items={[
                  [
                    'What is wrong',
                    <span className="whitespace-pre-wrap">{s.problemDescription}</span>,
                  ],
                  [
                    'What needs doing',
                    <span className="whitespace-pre-wrap">{s.recommendedWork}</span>,
                  ],
                  ['Date of visit', formatDate(s.siteVisitDate)],
                  [
                    'Location',
                    s.gpsLatitude
                      ? `${s.gpsLatitude}, ${s.gpsLongitude}${s.gpsAccuracyMetres ? ` (±${Math.round(Number(s.gpsAccuracyMetres))} m)` : ''}`
                      : 'Not recorded',
                  ],
                  ['Submitted', formatDateTime(s.submittedAt)],
                ]}
              />
            </div>
          </Panel>

          {data.measurements.length > 0 ? (
            <Panel>
              <PanelHeader title="Measurements" />
              <ul className="divide-y divide-ink-100 px-4 sm:px-5">
                {data.measurements.map((m) => (
                  <li key={m.id} className="flex items-baseline justify-between gap-4 py-2.5">
                    <span className="text-sm text-ink-700">{m.label}</span>
                    <span className="text-sm font-medium text-ink-900 tabular">
                      {m.value} {m.unit}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </>
      )}

      <AttachmentManager
        submissionId={s.id}
        attachments={data.attachments.map((a) => ({
          id: a.id,
          kind: a.kind,
          originalFilename: a.originalFilename,
          byteSize: a.byteSize,
          contentType: a.contentType,
        }))}
        editable={editable}
      />

      {editable ? (
        <SubmitSubmissionPanel
          submissionId={s.id}
          isResubmission={s.status === 'changes_requested'}
          hasEvidence={data.attachments.length > 0 || data.measurements.length > 0}
        />
      ) : null}

      <Panel>
        <PanelHeader title="History" description="Every step on this submission." />
        <ol className="divide-y divide-ink-100 px-4 sm:px-5">
          {data.events.map((e) => (
            <li key={e.id} className="py-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-ink-900">
                  {formatEventAction(e.action)}
                </span>
                <span className="text-xs text-ink-400">{formatDateTime(e.createdAt)}</span>
              </div>
              {e.comment ? <p className="mt-0.5 text-sm text-ink-600">{e.comment}</p> : null}
            </li>
          ))}
        </ol>
      </Panel>
    </>
  )
}

function formatEventAction(action: string): string {
  const map: Record<string, string> = {
    created: 'Draft created',
    submitted: 'Submitted to the Technical Officer',
    resubmitted: 'Corrected and resubmitted',
    review_started: 'Review started',
    changes_requested: 'Correction requested',
    accepted: 'Accepted',
    marked_ready_for_documentation: 'Marked ready for documents',
    relinked: 'Project link corrected',
    cancelled: 'Cancelled',
  }
  return map[action] ?? action.replace(/_/g, ' ')
}

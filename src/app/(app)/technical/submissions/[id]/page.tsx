import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { and, asc, eq, isNull } from 'drizzle-orm'
import {
  clients,
  documents,
  engineerSubmissions,
  profiles,
  projects,
  submissionAttachments,
  submissionEvents,
  submissionMeasurements,
} from '@/db/schema'
import { AttachmentManager } from '@/components/attachment-manager'
import { ReviewActions } from '@/components/review-actions'
import { SubmissionQuotation } from '@/components/submission-quotation'
import { Badge, DescriptionList, Notice, PageHeader, Panel, PanelHeader } from '@/components/ui'
import { pageContext } from '@/lib/authz/guard'
import { hasPermission } from '@/lib/authz/roles'
import { AuthorizationError } from '@/lib/errors'
import { checkConfigReadiness } from '@/lib/finance/config'
import {
  formatDate,
  formatDateTime,
  SUBMISSION_STATUS,
  URGENCY,
  type SubmissionStatus,
  type Urgency,
} from '@/lib/display'

export const metadata: Metadata = { title: 'Review submission' }

export default async function ReviewSubmissionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const data = await pageContext(async (db, actor) => {
    if (!hasPermission(actor.roles, 'submission.view_all')) {
      throw new AuthorizationError('This is the Technical Office queue.')
    }

    const [submission] = await db
      .select({
        s: engineerSubmissions,
        projectId: projects.id,
        projectName: projects.name,
        projectRef: projects.reference,
        clientName: clients.legalName,
        clientTin: clients.tin,
        engineerName: profiles.fullName,
        engineerPhone: profiles.phone,
      })
      .from(engineerSubmissions)
      .innerJoin(projects, eq(projects.id, engineerSubmissions.projectId))
      .innerJoin(clients, eq(clients.id, engineerSubmissions.clientId))
      .innerJoin(profiles, eq(profiles.id, engineerSubmissions.submittedBy))
      .where(eq(engineerSubmissions.id, id))
      .limit(1)

    if (!submission) return null

    const [measurements, attachments, events, allProjects] = await Promise.all([
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
        .select({
          e: submissionEvents,
          actorName: profiles.fullName,
        })
        .from(submissionEvents)
        .leftJoin(profiles, eq(profiles.id, submissionEvents.actorId))
        .where(eq(submissionEvents.submissionId, id))
        .orderBy(asc(submissionEvents.createdAt)),
      db
        .select({
          id: projects.id,
          name: projects.name,
          reference: projects.reference,
          clientName: clients.legalName,
        })
        .from(projects)
        .innerJoin(clients, eq(clients.id, projects.clientId))
        .orderBy(asc(clients.legalName), asc(projects.name))
        .limit(500),
    ])

    // Documents already drafted from this visit, and whether the settings a
    // quotation depends on have been approved yet.
    const [derivedDocuments, readiness] = await Promise.all([
      db
        .select({
          id: documents.id,
          reference: documents.reference,
          documentType: documents.documentType,
          status: documents.status,
        })
        .from(documents)
        .where(eq(documents.sourceSubmissionId, id))
        .orderBy(asc(documents.createdAt)),
      checkConfigReadiness(db, 'quotation', 'TZS'),
    ])

    return {
      ...submission,
      measurements,
      attachments,
      events,
      allProjects,
      derivedDocuments,
      readiness,
      canCreateDocument: hasPermission(actor.roles, 'document.create'),
      canReview: hasPermission(actor.roles, 'submission.review'),
      canRelink: hasPermission(actor.roles, 'project.manage'),
      canCancel: hasPermission(actor.roles, 'submission.cancel'),
    }
  })

  if (!data) notFound()

  const s = data.s
  const status = SUBMISSION_STATUS[s.status as SubmissionStatus]
  const urgency = URGENCY[s.urgency as Urgency]

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/technical" className="hover:underline">
            ← Review queue
          </Link>
        }
        title={s.title}
        description={`${data.clientName} · ${data.projectName} (${data.projectRef})`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={urgency.tone}>{urgency.label}</Badge>
            <Badge tone={status.tone}>{status.label}</Badge>
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
        <Notice tone="warn" title="Returned to the Engineer">
          {s.correctionComment}
        </Notice>
      ) : null}

      <Panel>
        <PanelHeader
          title="What the Engineer filed"
          description={
            s.submittedSnapshot
              ? 'Locked at submission. This content cannot be edited by anyone.'
              : 'Still a draft.'
          }
        />
        <div className="px-4 sm:px-5">
          <DescriptionList
            items={[
              ['Engineer', `${data.engineerName}${data.engineerPhone ? ` · ${data.engineerPhone}` : ''}`],
              ['What is wrong', <span className="whitespace-pre-wrap">{s.problemDescription}</span>],
              ['What needs doing', <span className="whitespace-pre-wrap">{s.recommendedWork}</span>],
              ['Date of visit', formatDate(s.siteVisitDate)],
              [
                'Location',
                s.gpsLatitude ? (
                  <a
                    className="text-brand-700 hover:underline tabular"
                    href={`https://www.google.com/maps/search/?api=1&query=${s.gpsLatitude},${s.gpsLongitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {s.gpsLatitude}, {s.gpsLongitude}
                    {s.gpsAccuracyMetres ? ` (±${Math.round(Number(s.gpsAccuracyMetres))} m)` : ''}
                  </a>
                ) : (
                  'Not recorded'
                ),
              ],
              ['Submitted', formatDateTime(s.submittedAt)],
              ['Client TIN', data.clientTin ?? 'Not on file'],
            ]}
          />
        </div>
      </Panel>

      {data.measurements.length > 0 ? (
        <Panel>
          <PanelHeader title="Measurements" />
          <ul className="divide-y divide-ink-100 px-4 sm:px-5">
            {data.measurements.map((m) => (
              <li key={m.id} className="py-2.5">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-sm text-ink-700">{m.label}</span>
                  <span className="text-sm font-medium text-ink-900 tabular">
                    {m.value} {m.unit}
                  </span>
                </div>
                {m.notes ? <p className="mt-0.5 text-xs text-ink-500">{m.notes}</p> : null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <AttachmentManager
        submissionId={s.id}
        attachments={data.attachments.map((a) => ({
          id: a.id,
          kind: a.kind,
          originalFilename: a.originalFilename,
          byteSize: a.byteSize,
          contentType: a.contentType,
        }))}
        editable={false}
      />

      {data.canReview ? (
        <ReviewActions
          submissionId={s.id}
          status={s.status}
          currentProjectId={data.projectId}
          internalReviewNotes={s.internalReviewNotes ?? ''}
          projects={data.allProjects}
          canRelink={data.canRelink}
          canCancel={data.canCancel}
        />
      ) : null}

      <SubmissionQuotation
        submissionId={s.id}
        status={s.status}
        existing={data.derivedDocuments}
        canCreate={data.canCreateDocument}
        configReady={data.readiness.ready}
        configMissing={data.readiness.missing}
      />

      <Panel>
        <PanelHeader title="History" />
        <ol className="divide-y divide-ink-100 px-4 sm:px-5">
          {data.events.map(({ e, actorName }) => (
            <li key={e.id} className="py-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-ink-900">
                  {e.action.replace(/_/g, ' ')}
                  {actorName ? <span className="font-normal text-ink-500"> — {actorName}</span> : null}
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

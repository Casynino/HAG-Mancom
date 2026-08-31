'use server'

import { revalidatePath } from 'next/cache'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import type { Database } from '@/db/client'
import {
  engineerSubmissions,
  projects,
  submissionAttachments,
  submissionEvents,
  submissionMeasurements,
  userRoles,
} from '@/db/schema'
import { notifyMany, recordAudit } from '@/lib/audit'
import { asActor, type Actor } from '@/lib/authz/guard'
import {
  actionError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
  type ActionResult,
} from '@/lib/errors'
import { checksum, getStorage, submissionAttachmentKey } from '@/lib/storage'
import {
  ATTACHMENT_RULES,
  checkFile,
  MAX_ATTACHMENTS_PER_SUBMISSION,
  sanitiseFilename,
  type AttachmentKind,
} from '@/lib/storage/limits'
import {
  attachmentMetaSchema,
  fieldErrorsFrom,
  submissionDraftSchema,
  submissionIdSchema,
} from '@/lib/validation/schemas'

/**
 * Engineer submission workflow.
 *
 * Authorisation here is belt and braces by design. Each action checks the
 * permission matrix, and every statement it then issues runs under Row Level
 * Security as the acting user. An Engineer who is not a member of a project
 * cannot file against it even if they forge the project id, because the RLS
 * INSERT policy re-checks membership.
 */

function parseMeasurements(formData: FormData) {
  const raw = formData.get('measurements')
  if (typeof raw !== 'string' || raw.trim() === '') return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    throw new ValidationError('The measurements could not be read. Please re-enter them.', {
      measurements: ['Could not read the measurements.'],
    })
  }
}

function draftInputFrom(formData: FormData) {
  return submissionDraftSchema.safeParse({
    projectId: formData.get('projectId'),
    title: formData.get('title'),
    problemDescription: formData.get('problemDescription'),
    recommendedWork: formData.get('recommendedWork'),
    urgency: formData.get('urgency'),
    siteVisitDate: formData.get('siteVisitDate') || undefined,
    gpsLatitude: formData.get('gpsLatitude') || undefined,
    gpsLongitude: formData.get('gpsLongitude') || undefined,
    gpsAccuracyMetres: formData.get('gpsAccuracyMetres') || undefined,
    measurements: parseMeasurements(formData),
  })
}

/** Loads a submission the actor may edit, or explains why they may not. */
async function loadEditable(db: Database, actor: Actor, submissionId: string) {
  const [row] = await db
    .select()
    .from(engineerSubmissions)
    .where(eq(engineerSubmissions.id, submissionId))
    .limit(1)

  if (!row) throw new NotFoundError('That submission does not exist, or you cannot access it.')

  if (row.submittedBy !== actor.id) {
    throw new AuthorizationError('Only the Engineer who created this submission can change it.')
  }

  if (row.status !== 'draft' && row.status !== 'changes_requested') {
    throw new ConflictError(
      row.status === 'submitted' || row.status === 'under_review'
        ? 'This submission is with the Technical Officer and can no longer be changed.'
        : 'This submission has been completed and can no longer be changed.',
    )
  }

  return row
}

async function replaceMeasurements(
  db: Database,
  submissionId: string,
  measurements: Array<{ label: string; value: number; unit: string; notes?: string }>,
) {
  await db
    .delete(submissionMeasurements)
    .where(eq(submissionMeasurements.submissionId, submissionId))

  if (measurements.length === 0) return

  await db.insert(submissionMeasurements).values(
    measurements.map((m, index) => ({
      submissionId,
      label: m.label,
      value: String(m.value),
      unit: m.unit,
      notes: m.notes ?? null,
      position: index,
    })),
  )
}

export async function createSubmissionAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = draftInputFrom(formData)
    if (!parsed.success) {
      throw new ValidationError('Check the details below.', fieldErrorsFrom(parsed.error))
    }
    const input = parsed.data

    const id = await asActor(async (db, actor) => {
      // The project must exist and be visible to this actor. RLS already limits
      // what they can see, so a missing row here means "not yours".
      const [project] = await db
        .select({ id: projects.id, clientId: projects.clientId, status: projects.status })
        .from(projects)
        .where(eq(projects.id, input.projectId))
        .limit(1)

      if (!project) {
        throw new ValidationError('Select a project you are assigned to.', {
          projectId: ['You are not assigned to that project.'],
        })
      }

      if (project.status === 'archived' || project.status === 'completed') {
        throw new ValidationError('That project is closed.', {
          projectId: ['That project is closed to new submissions.'],
        })
      }

      const [created] = await db
        .insert(engineerSubmissions)
        .values({
          projectId: project.id,
          clientId: project.clientId,
          submittedBy: actor.id,
          title: input.title,
          problemDescription: input.problemDescription,
          recommendedWork: input.recommendedWork,
          urgency: input.urgency,
          siteVisitDate: input.siteVisitDate || null,
          gpsLatitude: input.gpsLatitude != null ? String(input.gpsLatitude) : null,
          gpsLongitude: input.gpsLongitude != null ? String(input.gpsLongitude) : null,
          gpsAccuracyMetres:
            input.gpsAccuracyMetres != null ? String(input.gpsAccuracyMetres) : null,
          gpsCapturedAt: input.gpsLatitude != null ? new Date() : null,
          status: 'draft',
        })
        .returning({ id: engineerSubmissions.id })

      const submissionId = created!.id

      await replaceMeasurements(db, submissionId, input.measurements)

      await db.insert(submissionEvents).values({
        submissionId,
        actorId: actor.id,
        actorRole: actor.primaryRole,
        action: 'created',
        toStatus: 'draft',
      })

      await recordAudit(db, actor, {
        action: 'submission.created',
        entityType: 'engineer_submissions',
        entityId: submissionId,
        metadata: { projectId: project.id, urgency: input.urgency },
      })

      return submissionId
    })

    revalidatePath('/engineer')
    return { ok: true, data: { id }, message: 'Draft saved.' }
  } catch (err) {
    return actionError(err)
  }
}

export async function saveSubmissionAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const submissionId = String(formData.get('submissionId') ?? '')
    const idCheck = submissionIdSchema.safeParse({ submissionId })
    if (!idCheck.success) throw new NotFoundError()

    const parsed = draftInputFrom(formData)
    if (!parsed.success) {
      throw new ValidationError('Check the details below.', fieldErrorsFrom(parsed.error))
    }
    const input = parsed.data

    await asActor(async (db, actor) => {
      await loadEditable(db, actor, submissionId)

      await db
        .update(engineerSubmissions)
        .set({
          title: input.title,
          problemDescription: input.problemDescription,
          recommendedWork: input.recommendedWork,
          urgency: input.urgency,
          siteVisitDate: input.siteVisitDate || null,
          gpsLatitude: input.gpsLatitude != null ? String(input.gpsLatitude) : null,
          gpsLongitude: input.gpsLongitude != null ? String(input.gpsLongitude) : null,
          gpsAccuracyMetres:
            input.gpsAccuracyMetres != null ? String(input.gpsAccuracyMetres) : null,
        })
        .where(eq(engineerSubmissions.id, submissionId))

      await replaceMeasurements(db, submissionId, input.measurements)

      await recordAudit(db, actor, {
        action: 'submission.updated',
        entityType: 'engineer_submissions',
        entityId: submissionId,
      })
    })

    revalidatePath(`/engineer/submissions/${submissionId}`)
    return { ok: true, data: { id: submissionId }, message: 'Draft saved.' }
  } catch (err) {
    return actionError(err)
  }
}

export async function uploadAttachmentAction(
  _prev: ActionResult<{ count: number }> | null,
  formData: FormData,
): Promise<ActionResult<{ count: number }>> {
  try {
    const meta = attachmentMetaSchema.safeParse({
      submissionId: formData.get('submissionId'),
      kind: formData.get('kind'),
      caption: formData.get('caption') ?? undefined,
    })
    if (!meta.success) {
      throw new ValidationError('Check the details below.', fieldErrorsFrom(meta.error))
    }

    const { submissionId, kind, caption } = meta.data
    const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)

    if (files.length === 0) {
      throw new ValidationError('Choose at least one file.', { files: ['Choose at least one file.'] })
    }

    const stored = await asActor(async (db, actor) => {
      await loadEditable(db, actor, submissionId)

      const [existingRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(submissionAttachments)
        .where(
          and(
            eq(submissionAttachments.submissionId, submissionId),
            isNull(submissionAttachments.deletedAt),
          ),
        )
      const existing = existingRow?.count ?? 0

      if (existing + files.length > MAX_ATTACHMENTS_PER_SUBMISSION) {
        throw new ValidationError(
          `A submission can hold ${MAX_ATTACHMENTS_PER_SUBMISSION} attachments. This one already has ${existing}.`,
          { files: ['Too many attachments.'] },
        )
      }

      const storage = getStorage()
      const written: string[] = []

      try {
        for (const file of files) {
          const buffer = Buffer.from(await file.arrayBuffer())

          const verdict = checkFile({
            kind: kind as AttachmentKind,
            filename: file.name,
            contentType: file.type,
            byteSize: buffer.byteLength,
            head: new Uint8Array(buffer.subarray(0, 32)),
          })

          if (!verdict.ok) {
            throw new ValidationError(verdict.reason, { files: [verdict.reason] })
          }

          const key = submissionAttachmentKey(submissionId, kind as AttachmentKind, file.name)
          await storage.put(key, buffer, file.type)
          written.push(key)

          await db.insert(submissionAttachments).values({
            submissionId,
            kind: kind as AttachmentKind,
            originalFilename: sanitiseFilename(file.name),
            storageKey: key,
            contentType: file.type,
            byteSize: buffer.byteLength,
            checksumSha256: checksum(buffer),
            caption: caption ?? null,
            uploadedBy: actor.id,
          })
        }
      } catch (err) {
        // The database work rolls back with the transaction; the bytes do not.
        // Clean them up so storage does not accumulate orphans.
        await Promise.all(written.map((key) => storage.remove(key).catch(() => undefined)))
        throw err
      }

      await recordAudit(db, actor, {
        action: 'attachment.uploaded',
        entityType: 'engineer_submissions',
        entityId: submissionId,
        metadata: { kind, count: files.length },
      })

      return files.length
    })

    revalidatePath(`/engineer/submissions/${submissionId}`)
    return {
      ok: true,
      data: { count: stored },
      message: `${stored} ${ATTACHMENT_RULES[kind as AttachmentKind].label.toLowerCase()}${stored === 1 ? '' : 's'} added.`,
    }
  } catch (err) {
    return actionError(err)
  }
}

export async function removeAttachmentAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const attachmentId = String(formData.get('attachmentId') ?? '')
    const submissionId = String(formData.get('submissionId') ?? '')

    await asActor(async (db, actor) => {
      await loadEditable(db, actor, submissionId)

      // Soft delete. The original bytes stay in storage: an Engineer removing a
      // photo from a draft should not be able to destroy evidence.
      const updated = await db
        .update(submissionAttachments)
        .set({ deletedAt: new Date(), deletedBy: actor.id })
        .where(
          and(
            eq(submissionAttachments.id, attachmentId),
            eq(submissionAttachments.submissionId, submissionId),
            isNull(submissionAttachments.deletedAt),
          ),
        )
        .returning({ id: submissionAttachments.id })

      if (updated.length === 0) throw new NotFoundError('That attachment has already been removed.')

      await recordAudit(db, actor, {
        action: 'attachment.removed',
        entityType: 'submission_attachments',
        entityId: attachmentId,
        metadata: { submissionId },
      })
    })

    revalidatePath(`/engineer/submissions/${submissionId}`)
    return { ok: true, data: null, message: 'Attachment removed.' }
  } catch (err) {
    return actionError(err)
  }
}

/**
 * Files the submission with the Technical Officer.
 *
 * This is the moment the record stops being the Engineer's. It takes an
 * immutable snapshot, issues a reference, moves the status, and notifies the
 * review queue — all in one transaction, so none of it can half-happen.
 */
export async function submitSubmissionAction(
  _prev: ActionResult<{ reference: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ reference: string }>> {
  try {
    const submissionId = String(formData.get('submissionId') ?? '')
    const idCheck = submissionIdSchema.safeParse({ submissionId })
    if (!idCheck.success) throw new NotFoundError()

    const reference = await asActor(async (db, actor) => {
      const current = await loadEditable(db, actor, submissionId)
      const isResubmission = current.status === 'changes_requested'

      const measurements = await db
        .select()
        .from(submissionMeasurements)
        .where(eq(submissionMeasurements.submissionId, submissionId))
        .orderBy(asc(submissionMeasurements.position))

      const attachments = await db
        .select()
        .from(submissionAttachments)
        .where(
          and(
            eq(submissionAttachments.submissionId, submissionId),
            isNull(submissionAttachments.deletedAt),
          ),
        )

      if (attachments.length === 0 && measurements.length === 0) {
        throw new ValidationError(
          'Add at least one photo, file or measurement before submitting.',
          { attachments: ['Add at least one photo, file or measurement.'] },
        )
      }

      // Reference is issued once and kept across resubmissions, so the
      // Technical Officer keeps referring to the same job.
      let ref = current.reference
      if (!ref) {
        const result = await db.execute(sql`select app.next_submission_reference() as reference`)
        ref = (result.rows[0] as { reference: string }).reference
      }

      const snapshot = {
        capturedAt: new Date().toISOString(),
        revision: isResubmission ? current.revision + 1 : current.revision,
        reference: ref,
        title: current.title,
        problemDescription: current.problemDescription,
        recommendedWork: current.recommendedWork,
        urgency: current.urgency,
        siteVisitDate: current.siteVisitDate,
        gps:
          current.gpsLatitude != null
            ? {
                latitude: current.gpsLatitude,
                longitude: current.gpsLongitude,
                accuracyMetres: current.gpsAccuracyMetres,
              }
            : null,
        measurements: measurements.map((m) => ({
          label: m.label,
          value: m.value,
          unit: m.unit,
          notes: m.notes,
        })),
        attachments: attachments.map((a) => ({
          id: a.id,
          kind: a.kind,
          filename: a.originalFilename,
          byteSize: a.byteSize,
          checksumSha256: a.checksumSha256,
        })),
      }

      await db
        .update(engineerSubmissions)
        .set({
          status: 'submitted',
          reference: ref,
          submittedAt: new Date(),
          submittedSnapshot: snapshot,
          revision: snapshot.revision,
          correctionComment: null,
        })
        .where(eq(engineerSubmissions.id, submissionId))

      await db.insert(submissionEvents).values({
        submissionId,
        actorId: actor.id,
        actorRole: actor.primaryRole,
        action: isResubmission ? 'resubmitted' : 'submitted',
        fromStatus: current.status,
        toStatus: 'submitted',
        metadata: {
          revision: snapshot.revision,
          attachmentCount: attachments.length,
          measurementCount: measurements.length,
        },
      })

      // Notify every Technical Officer. Directors are not notified at this
      // stage — the submission has not reached them yet.
      const officers = await db
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .where(and(eq(userRoles.role, 'technical_officer'), isNull(userRoles.revokedAt)))

      await notifyMany(
        db,
        actor.id,
        officers.map((o) => o.userId),
        {
          kind: 'submission_submitted',
          title: isResubmission
            ? `Corrected submission ${ref}`
            : `New site submission ${ref}`,
          body: `${current.title} — ${current.urgency} urgency, from ${actor.fullName}.`,
          entityType: 'engineer_submissions',
          entityId: submissionId,
          href: `/technical/submissions/${submissionId}`,
        },
      )

      await recordAudit(db, actor, {
        action: 'submission.submitted',
        entityType: 'engineer_submissions',
        entityId: submissionId,
        metadata: { reference: ref, revision: snapshot.revision, resubmission: isResubmission },
      })

      return ref
    })

    revalidatePath('/engineer')
    revalidatePath('/technical')
    return {
      ok: true,
      data: { reference },
      message: `Submitted as ${reference}. The Technical Officer has been notified.`,
    }
  } catch (err) {
    return actionError(err)
  }
}

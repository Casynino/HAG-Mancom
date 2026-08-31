'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import type { Database } from '@/db/client'
import {
  approvalDecisions,
  engineerSubmissions,
  projects,
  submissionEvents,
} from '@/db/schema'
import { notify, recordAudit } from '@/lib/audit'
import { asActorWith, type Actor } from '@/lib/authz/guard'
import {
  actionError,
  ConflictError,
  NotFoundError,
  ValidationError,
  type ActionResult,
} from '@/lib/errors'
import {
  acceptSubmissionSchema,
  fieldErrorsFrom,
  relinkSubmissionSchema,
  requestChangesSchema,
  reviewNoteSchema,
  submissionIdSchema,
} from '@/lib/validation/schemas'

/**
 * Technical Officer review workflow.
 *
 * Status changes are attempted here and validated by the database trigger
 * `app.enforce_submission_transition`. The checks in this file exist to produce
 * a good error message; the trigger is what makes an illegal transition
 * impossible.
 *
 * No quotation, invoice or document-rendering action appears here. Those belong
 * to the Document Engine phase and are deliberately absent rather than stubbed —
 * a button that does nothing is worse than no button.
 */

async function loadForReview(db: Database, submissionId: string) {
  const [row] = await db
    .select()
    .from(engineerSubmissions)
    .where(eq(engineerSubmissions.id, submissionId))
    .limit(1)

  if (!row) throw new NotFoundError('That submission does not exist, or you cannot access it.')
  return row
}

async function transition(
  db: Database,
  actor: Actor,
  submissionId: string,
  to: 'under_review' | 'changes_requested' | 'accepted' | 'ready_for_documentation' | 'cancelled',
  opts: {
    action: string
    comment?: string | null
    set?: Partial<typeof engineerSubmissions.$inferInsert>
  },
) {
  const current = await loadForReview(db, submissionId)

  if (current.status === to) {
    throw new ConflictError('That has already been done.')
  }

  await db
    .update(engineerSubmissions)
    .set({
      status: to,
      reviewedBy: actor.id,
      reviewedAt: new Date(),
      ...opts.set,
    })
    .where(eq(engineerSubmissions.id, submissionId))

  await db.insert(submissionEvents).values({
    submissionId,
    actorId: actor.id,
    actorRole: actor.primaryRole,
    action: opts.action,
    fromStatus: current.status,
    toStatus: to,
    comment: opts.comment ?? null,
  })

  return current
}

export async function startReviewAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const parsed = submissionIdSchema.safeParse({ submissionId: formData.get('submissionId') })
    if (!parsed.success) throw new NotFoundError()
    const { submissionId } = parsed.data

    await asActorWith('submission.review', async (db, actor) => {
      const current = await loadForReview(db, submissionId)
      if (current.status !== 'submitted') {
        throw new ConflictError('This submission is not waiting to be picked up.')
      }

      await transition(db, actor, submissionId, 'under_review', { action: 'review_started' })

      await recordAudit(db, actor, {
        action: 'submission.review_started',
        entityType: 'engineer_submissions',
        entityId: submissionId,
      })
    })

    revalidatePath(`/technical/submissions/${submissionId}`)
    revalidatePath('/technical')
    return { ok: true, data: null, message: 'Review started.' }
  } catch (err) {
    return actionError(err)
  }
}

export async function saveReviewNotesAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const parsed = reviewNoteSchema.safeParse({
      submissionId: formData.get('submissionId'),
      internalReviewNotes: formData.get('internalReviewNotes') ?? undefined,
    })
    if (!parsed.success) {
      throw new ValidationError('Check the details below.', fieldErrorsFrom(parsed.error))
    }
    const { submissionId, internalReviewNotes } = parsed.data

    await asActorWith('submission.review', async (db, actor) => {
      await loadForReview(db, submissionId)

      await db
        .update(engineerSubmissions)
        .set({ internalReviewNotes: internalReviewNotes ?? null })
        .where(eq(engineerSubmissions.id, submissionId))

      await recordAudit(db, actor, {
        action: 'submission.updated',
        entityType: 'engineer_submissions',
        entityId: submissionId,
        metadata: { field: 'internal_review_notes' },
      })
    })

    revalidatePath(`/technical/submissions/${submissionId}`)
    return { ok: true, data: null, message: 'Notes saved. These are internal and not shown to the Engineer.' }
  } catch (err) {
    return actionError(err)
  }
}

/** Returns the submission to the Engineer with an explanation. */
export async function requestChangesAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const parsed = requestChangesSchema.safeParse({
      submissionId: formData.get('submissionId'),
      comment: formData.get('comment'),
    })
    if (!parsed.success) {
      throw new ValidationError('Check the details below.', fieldErrorsFrom(parsed.error))
    }
    const { submissionId, comment } = parsed.data

    await asActorWith('submission.request_changes', async (db, actor) => {
      const current = await transition(db, actor, submissionId, 'changes_requested', {
        action: 'changes_requested',
        comment,
        set: { correctionComment: comment },
      })

      await db.insert(approvalDecisions).values({
        subjectType: 'engineer_submission',
        subjectId: submissionId,
        subjectVersion: current.revision,
        decision: 'changes_requested',
        actorId: actor.id,
        actorRole: actor.primaryRole!,
        priorStatus: current.status,
        newStatus: 'changes_requested',
        comment,
      })

      await notify(db, actor.id, {
        userId: current.submittedBy,
        kind: 'submission_changes_requested',
        title: `Correction needed on ${current.reference ?? current.title}`,
        body: comment,
        entityType: 'engineer_submissions',
        entityId: submissionId,
        href: `/engineer/submissions/${submissionId}`,
      })

      await recordAudit(db, actor, {
        action: 'submission.changes_requested',
        entityType: 'engineer_submissions',
        entityId: submissionId,
        metadata: { revision: current.revision },
      })
    })

    revalidatePath(`/technical/submissions/${submissionId}`)
    revalidatePath('/technical')
    return { ok: true, data: null, message: 'Returned to the Engineer with your comment.' }
  } catch (err) {
    return actionError(err)
  }
}

export async function acceptSubmissionAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const parsed = acceptSubmissionSchema.safeParse({
      submissionId: formData.get('submissionId'),
      comment: formData.get('comment') ?? undefined,
    })
    if (!parsed.success) {
      throw new ValidationError('Check the details below.', fieldErrorsFrom(parsed.error))
    }
    const { submissionId, comment } = parsed.data

    await asActorWith('submission.accept', async (db, actor) => {
      const current = await transition(db, actor, submissionId, 'accepted', {
        action: 'accepted',
        comment: comment ?? null,
      })

      await db.insert(approvalDecisions).values({
        subjectType: 'engineer_submission',
        subjectId: submissionId,
        subjectVersion: current.revision,
        decision: 'approved',
        actorId: actor.id,
        actorRole: actor.primaryRole!,
        priorStatus: current.status,
        newStatus: 'accepted',
        comment: comment ?? null,
      })

      await notify(db, actor.id, {
        userId: current.submittedBy,
        kind: 'submission_accepted',
        title: `${current.reference ?? current.title} accepted`,
        body: comment ?? 'Your submission has been accepted by the Technical Office.',
        entityType: 'engineer_submissions',
        entityId: submissionId,
        href: `/engineer/submissions/${submissionId}`,
      })

      await recordAudit(db, actor, {
        action: 'submission.accepted',
        entityType: 'engineer_submissions',
        entityId: submissionId,
      })
    })

    revalidatePath(`/technical/submissions/${submissionId}`)
    revalidatePath('/technical')
    return { ok: true, data: null, message: 'Accepted.' }
  } catch (err) {
    return actionError(err)
  }
}

/**
 * Marks the submission as complete enough to become a quotation.
 *
 * This is the hand-off point to the Document Engine phase. Nothing downstream
 * exists yet, so the action records the state and stops there.
 */
export async function markReadyAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const parsed = submissionIdSchema.safeParse({ submissionId: formData.get('submissionId') })
    if (!parsed.success) throw new NotFoundError()
    const { submissionId } = parsed.data

    await asActorWith('submission.mark_ready', async (db, actor) => {
      const current = await loadForReview(db, submissionId)
      if (current.status !== 'accepted') {
        throw new ConflictError('Accept the submission before marking it ready.')
      }

      await transition(db, actor, submissionId, 'ready_for_documentation', {
        action: 'marked_ready_for_documentation',
        set: { readyForDocumentationAt: new Date() },
      })

      await notify(db, actor.id, {
        userId: current.submittedBy,
        kind: 'submission_ready_for_documentation',
        title: `${current.reference ?? current.title} is ready for documentation`,
        entityType: 'engineer_submissions',
        entityId: submissionId,
        href: `/engineer/submissions/${submissionId}`,
      })

      await recordAudit(db, actor, {
        action: 'submission.marked_ready',
        entityType: 'engineer_submissions',
        entityId: submissionId,
      })
    })

    revalidatePath(`/technical/submissions/${submissionId}`)
    revalidatePath('/technical')
    return { ok: true, data: null, message: 'Marked ready for document preparation.' }
  } catch (err) {
    return actionError(err)
  }
}

/**
 * Corrects the client/project a submission was filed against.
 *
 * Permitted because Engineers file from site and pick the wrong project. The
 * reason is mandatory and the change is audited with both the old and new
 * values — the trigger allows this specific field to move after submission
 * while keeping the Engineer's own content frozen.
 */
export async function relinkSubmissionAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const parsed = relinkSubmissionSchema.safeParse({
      submissionId: formData.get('submissionId'),
      projectId: formData.get('projectId'),
      reason: formData.get('reason'),
    })
    if (!parsed.success) {
      throw new ValidationError('Check the details below.', fieldErrorsFrom(parsed.error))
    }
    const { submissionId, projectId, reason } = parsed.data

    await asActorWith('project.manage', async (db, actor) => {
      const current = await loadForReview(db, submissionId)

      if (current.projectId === projectId) {
        throw new ConflictError('That is already the linked project.')
      }

      const [target] = await db
        .select({ id: projects.id, clientId: projects.clientId })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1)

      if (!target) {
        throw new ValidationError('Choose a project that exists.', {
          projectId: ['That project could not be found.'],
        })
      }

      await db
        .update(engineerSubmissions)
        .set({ projectId: target.id, clientId: target.clientId })
        .where(eq(engineerSubmissions.id, submissionId))

      await db.insert(submissionEvents).values({
        submissionId,
        actorId: actor.id,
        actorRole: actor.primaryRole,
        action: 'relinked',
        comment: reason,
        metadata: {
          fromProjectId: current.projectId,
          toProjectId: target.id,
          fromClientId: current.clientId,
          toClientId: target.clientId,
        },
      })

      await recordAudit(db, actor, {
        action: 'submission.updated',
        entityType: 'engineer_submissions',
        entityId: submissionId,
        metadata: {
          field: 'project',
          from: current.projectId,
          to: target.id,
          reason,
        },
      })
    })

    revalidatePath(`/technical/submissions/${submissionId}`)
    return { ok: true, data: null, message: 'Project link corrected.' }
  } catch (err) {
    return actionError(err)
  }
}

export async function cancelSubmissionAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const submissionId = String(formData.get('submissionId') ?? '')
    const reason = String(formData.get('reason') ?? '').trim()

    if (reason.length < 5) {
      throw new ValidationError('Give a reason for cancelling.', {
        reason: ['Give a reason of at least 5 characters.'],
      })
    }

    await asActorWith('submission.cancel', async (db, actor) => {
      const current = await transition(db, actor, submissionId, 'cancelled', {
        action: 'cancelled',
        comment: reason,
      })

      await notify(db, actor.id, {
        userId: current.submittedBy,
        kind: 'submission_cancelled',
        title: `${current.reference ?? current.title} was cancelled`,
        body: reason,
        entityType: 'engineer_submissions',
        entityId: submissionId,
        href: `/engineer/submissions/${submissionId}`,
      })

      await recordAudit(db, actor, {
        action: 'submission.cancelled',
        entityType: 'engineer_submissions',
        entityId: submissionId,
        metadata: { reason },
      })
    })

    revalidatePath('/technical')
    return { ok: true, data: null, message: 'Submission cancelled.' }
  } catch (err) {
    return actionError(err)
  }
}

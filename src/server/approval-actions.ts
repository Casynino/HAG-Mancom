'use server'

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { and, asc, eq } from 'drizzle-orm'
import type { Database } from '@/db/client'
import {
  approvalDecisions,
  approvalPolicies,
  companyAssets,
  documentEvents,
  documentSeals,
  documentVersions,
  documents,
} from '@/db/schema'
import { notify, notifyMany, recordAudit } from '@/lib/audit'
import { asActorWith, type Actor } from '@/lib/authz/guard'
import { canApplySignature, canApplyStamp } from '@/lib/authz/roles'
import {
  actionError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
  type ActionResult,
} from '@/lib/errors'
import { buildRenderModel } from '@/lib/documents/render/build'
import { renderDocumentDocx } from '@/lib/documents/render/docx'
import { renderDocumentPdf } from '@/lib/documents/render/pdf'
import { withExtension } from '@/lib/documents/naming'
import { approvalDecisionSchema, fieldErrorsFrom } from '@/lib/validation/document-schemas'
import { checksum, getStorage } from '@/lib/storage'

/**
 * Approvals, signatures, stamps and versioning — Stage 5.
 *
 * The guarantees this module has to keep:
 *
 *   * the version that was reviewed is preserved unsigned, forever;
 *   * approving creates a new, final version carrying a content hash;
 *   * a signature can only ever be applied by the Director it belongs to;
 *   * a Technical Officer can never apply a signature or the stamp, whatever
 *     approval authority they have been delegated;
 *   * an approved document cannot be edited — a correction is a new revision.
 *
 * Each of those is also enforced by the database (see 0013), so this layer
 * exists to produce clear errors and to do the work, not to be the last line.
 */

interface ApprovalAuthority {
  mayApprove: boolean
  asDirector: boolean
  underDelegation: boolean
  requiresSignature: boolean
  requiresStamp: boolean
  reason: string | null
}

/**
 * Resolves who may approve a given document.
 *
 * Director approval is the default. An Administrator may delegate a document
 * type to Technical Officers, optionally only for urgent work and below a value
 * ceiling. Delegation never extends to sealing.
 */
async function resolveAuthority(
  db: Database,
  actor: Actor,
  doc: typeof documents.$inferSelect,
): Promise<ApprovalAuthority> {
  const [policy] = await db
    .select()
    .from(approvalPolicies)
    .where(
      and(
        eq(approvalPolicies.documentType, doc.documentType),
        eq(approvalPolicies.state, 'approved'),
      ),
    )
    .limit(1)

  const isDirector = actor.roles.includes('director')
  const isOfficer = actor.roles.includes('technical_officer')

  const requiresSignature = policy?.requiresSignature ?? false
  const requiresStamp = policy?.requiresStamp ?? false

  if (isDirector) {
    return {
      mayApprove: true,
      asDirector: true,
      underDelegation: false,
      requiresSignature,
      requiresStamp,
      reason: null,
    }
  }

  if (!policy) {
    return {
      mayApprove: false,
      asDirector: false,
      underDelegation: false,
      requiresSignature,
      requiresStamp,
      reason:
        'No approved approval policy exists for this document type, so Director approval is required.',
    }
  }

  if (isOfficer && policy.technicalOfficerMayApprove && !policy.requiresDirectorApproval) {
    // A delegated approval still cannot seal, and still has to satisfy the
    // limits the Administrator attached to the delegation.
    if (policy.delegationMaxValue && doc.grandTotal) {
      if (Number(doc.grandTotal) > Number(policy.delegationMaxValue)) {
        return {
          mayApprove: false,
          asDirector: false,
          underDelegation: false,
          requiresSignature,
          requiresStamp,
          reason: `This document exceeds the delegated approval limit of ${policy.delegationCurrency} ${policy.delegationMaxValue}. It needs Director approval.`,
        }
      }
    }

    if (requiresSignature || requiresStamp) {
      return {
        mayApprove: false,
        asDirector: false,
        underDelegation: false,
        requiresSignature,
        requiresStamp,
        reason:
          'This document type requires a signature or the company stamp, which only a Director may apply.',
      }
    }

    return {
      mayApprove: true,
      asDirector: false,
      underDelegation: true,
      requiresSignature,
      requiresStamp,
      reason: null,
    }
  }

  return {
    mayApprove: false,
    asDirector: false,
    underDelegation: false,
    requiresSignature,
    requiresStamp,
    reason: 'This document requires Director approval.',
  }
}

/**
 * Renders a version to PDF and DOCX and stores both.
 *
 * `includeSeals` controls whether the signature and stamp appear, which is how
 * the unsigned original and the sealed final are produced from the same data.
 */
async function renderVersion(
  db: Database,
  documentId: string,
  versionId: string,
  opts: { includeSeals: boolean; filename: string },
) {
  const { model, warnings } = await buildRenderModel(db, documentId, {
    includeSeals: opts.includeSeals,
    watermark: opts.includeSeals ? null : undefined,
  })

  const storage = getStorage()
  const [pdf, docx] = await Promise.all([renderDocumentPdf(model), renderDocumentDocx(model)])

  const suffix = opts.includeSeals ? 'signed' : 'unsigned'
  const pdfKey = `documents/${documentId}/${versionId}-${suffix}.pdf`
  const docxKey = `documents/${documentId}/${versionId}-${suffix}.docx`

  await storage.put(pdfKey, pdf, 'application/pdf')
  await storage.put(
    docxKey,
    docx,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  )

  const update = opts.includeSeals
    ? { signedPdfStorageKey: pdfKey, signedPdfByteSize: pdf.byteLength }
    : {
        pdfStorageKey: pdfKey,
        pdfByteSize: pdf.byteLength,
        docxStorageKey: docxKey,
        docxByteSize: docx.byteLength,
      }

  await db.update(documentVersions).set(update).where(eq(documentVersions.id, versionId))

  return { warnings, pdfKey, docxKey, checksum: checksum(pdf), filename: opts.filename }
}

export async function decideDocumentAction(
  _prev: ActionResult<{ status: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ status: string }>> {
  try {
    const parsed = approvalDecisionSchema.safeParse({
      documentId: formData.get('documentId'),
      decision: formData.get('decision'),
      comment: formData.get('comment') ?? undefined,
      applySignature: formData.get('applySignature') === 'on',
      applyStamp: formData.get('applyStamp') === 'on',
    })
    if (!parsed.success) {
      throw new ValidationError('Check the details below.', fieldErrorsFrom(parsed.error))
    }

    const { documentId, decision, comment, applySignature, applyStamp } = parsed.data

    if ((decision === 'reject' || decision === 'request_changes') && !comment) {
      throw new ValidationError('Say why.', {
        comment: ['A comment is required when rejecting or requesting a correction.'],
      })
    }

    const outcome = await asActorWith('approval.decide', async (db, actor) => {
      const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1)
      if (!doc) throw new NotFoundError('That document no longer exists.')

      if (doc.status !== 'pending_approval') {
        throw new ConflictError(
          doc.status === 'approved'
            ? 'This document has already been approved.'
            : 'This document is not waiting for a decision.',
        )
      }

      const authority = await resolveAuthority(db, actor, doc)
      if (!authority.mayApprove) {
        throw new AuthorizationError(authority.reason ?? 'You cannot decide on this document.')
      }

      const [currentVersion] = await db
        .select()
        .from(documentVersions)
        .where(
          and(
            eq(documentVersions.documentId, documentId),
            eq(documentVersions.version, doc.currentVersion),
          ),
        )
        .limit(1)

      if (!currentVersion) {
        throw new ConflictError('This document has no submitted version to decide on.')
      }

      // ---- Rejection and correction -------------------------------------
      if (decision !== 'approve') {
        const newStatus = decision === 'reject' ? 'rejected' : 'changes_requested'

        await db
          .update(documents)
          .set({ status: newStatus, correctionComment: comment ?? null })
          .where(eq(documents.id, documentId))

        await db.insert(approvalDecisions).values({
          subjectType: 'document',
          subjectId: documentId,
          subjectVersion: doc.currentVersion,
          decision: decision === 'reject' ? 'rejected' : 'changes_requested',
          actorId: actor.id,
          actorRole: actor.primaryRole!,
          underDelegation: authority.underDelegation,
          priorStatus: doc.status,
          newStatus,
          comment: comment ?? null,
        })

        await db.insert(documentEvents).values({
          documentId,
          actorId: actor.id,
          actorRole: actor.primaryRole,
          action: decision === 'reject' ? 'rejected' : 'changes_requested',
          fromStatus: doc.status,
          toStatus: newStatus,
          comment: comment ?? null,
        })

        if (doc.submittedBy) {
          await notify(db, actor.id, {
            userId: doc.submittedBy,
            kind: decision === 'reject' ? 'document_rejected' : 'document_changes_requested',
            title: `${doc.reference ?? doc.title} — ${decision === 'reject' ? 'rejected' : 'correction requested'}`,
            body: comment ?? null,
            entityType: 'documents',
            entityId: documentId,
            href: `/technical/documents/${documentId}`,
          })
        }

        await recordAudit(db, actor, {
          action: decision === 'reject' ? 'document.rejected' : 'document.changes_requested',
          entityType: 'documents',
          entityId: documentId,
          metadata: { reference: doc.reference, version: doc.currentVersion, comment },
        })

        return { status: newStatus, warnings: [] as string[] }
      }

      // ---- Approval -------------------------------------------------------
      // Sealing is checked here as well as in the database trigger, so the
      // person gets a sentence rather than a constraint violation.
      if (applySignature && !canApplySignature(actor.roles)) {
        throw new AuthorizationError(
          'Only a Director may apply a signature. A Technical Officer never can, whatever approval authority they hold.',
        )
      }
      if (applyStamp && !canApplyStamp(actor.roles)) {
        throw new AuthorizationError(
          'Only a Director or Administrator may apply the company stamp.',
        )
      }
      if (authority.requiresSignature && !applySignature) {
        throw new ValidationError('This document type requires a signature.', {
          applySignature: ['Apply your signature to approve this document type.'],
        })
      }
      if (authority.requiresStamp && !applyStamp) {
        throw new ValidationError('This document type requires the company stamp.', {
          applyStamp: ['Apply the company stamp to approve this document type.'],
        })
      }

      // The approved version is a NEW row. The reviewed version stays exactly
      // as it was, which is what "preserve the unsigned version" means.
      const approvedSnapshot = {
        ...(currentVersion.snapshot as Record<string, unknown>),
        approval: {
          decidedAt: new Date().toISOString(),
          decidedBy: actor.id,
          decidedByRole: actor.primaryRole,
          underDelegation: authority.underDelegation,
          reviewedVersion: currentVersion.version,
          reviewedContentHash: currentVersion.contentHash,
          comment: comment ?? null,
        },
      }

      const approvedHash = createHash('sha256')
        .update(JSON.stringify(approvedSnapshot))
        .digest('hex')

      const approvedVersionNumber = doc.currentVersion + 1

      const [approvedVersion] = await db
        .insert(documentVersions)
        .values({
          documentId,
          version: approvedVersionNumber,
          statusAtCapture: 'approved',
          snapshot: approvedSnapshot,
          contentHash: approvedHash,
          changeSummary: 'Approved',
          isApprovedVersion: true,
          signatureApplied: applySignature,
          stampApplied: applyStamp,
          createdBy: actor.id,
        })
        .returning({ id: documentVersions.id })

      const versionId = approvedVersion!.id

      // Seals are recorded before the sealed rendering, so the PDF shows what
      // the ledger says was applied.
      if (applySignature || applyStamp) {
        const assets = await db
          .select()
          .from(companyAssets)
          .where(eq(companyAssets.state, 'approved'))

        if (applySignature) {
          const signature = assets.find((a) => a.kind === 'signature' && a.ownerUserId === actor.id)
          if (!signature) {
            throw new ConflictError(
              'You have no approved signature on file. Upload one in your profile before approving documents that need signing.',
            )
          }
          await db.insert(documentSeals).values({
            documentVersionId: versionId,
            sealKind: 'signature',
            companyAssetId: signature.id,
            appliedBy: actor.id,
            appliedByRole: actor.primaryRole!,
            contentHash: approvedHash,
          })
        }

        if (applyStamp) {
          const stamp = assets.find((a) => a.kind === 'stamp')
          if (!stamp) {
            throw new ConflictError(
              'No approved company stamp is on file. An Administrator must upload and approve one.',
            )
          }
          await db.insert(documentSeals).values({
            documentVersionId: versionId,
            sealKind: 'stamp',
            companyAssetId: stamp.id,
            appliedBy: actor.id,
            appliedByRole: actor.primaryRole!,
            contentHash: approvedHash,
          })
        }
      }

      await db
        .update(documents)
        .set({
          status: 'approved',
          currentVersion: approvedVersionNumber,
          approvedBy: actor.id,
          approvedAt: new Date(),
          correctionComment: null,
        })
        .where(eq(documents.id, documentId))

      await db.insert(approvalDecisions).values({
        subjectType: 'document',
        subjectId: documentId,
        subjectVersion: currentVersion.version,
        decision: 'approved',
        actorId: actor.id,
        actorRole: actor.primaryRole!,
        underDelegation: authority.underDelegation,
        priorStatus: doc.status,
        newStatus: 'approved',
        comment: comment ?? null,
      })

      await db.insert(documentEvents).values({
        documentId,
        actorId: actor.id,
        actorRole: actor.primaryRole,
        action: 'approved',
        fromStatus: doc.status,
        toStatus: 'approved',
        comment: comment ?? null,
        metadata: {
          version: approvedVersionNumber,
          contentHash: approvedHash,
          signature: applySignature,
          stamp: applyStamp,
          underDelegation: authority.underDelegation,
        },
      })

      // Render the final documents. Unsigned first, always, then the sealed
      // copy if anything was applied.
      const unsigned = await renderVersion(db, documentId, versionId, {
        includeSeals: false,
        filename: doc.filename ?? `${doc.reference ?? 'document'}.pdf`,
      })

      const warnings = [...unsigned.warnings]

      if (applySignature || applyStamp) {
        const sealed = await renderVersion(db, documentId, versionId, {
          includeSeals: true,
          filename: doc.filename ?? `${doc.reference ?? 'document'}.pdf`,
        })
        warnings.push(...sealed.warnings)
      }

      if (applySignature) {
        await recordAudit(db, actor, {
          action: 'document.signature_applied',
          entityType: 'documents',
          entityId: documentId,
          metadata: { version: approvedVersionNumber, contentHash: approvedHash },
        })
      }
      if (applyStamp) {
        await recordAudit(db, actor, {
          action: 'document.stamp_applied',
          entityType: 'documents',
          entityId: documentId,
          metadata: { version: approvedVersionNumber, contentHash: approvedHash },
        })
      }

      await recordAudit(db, actor, {
        action: 'document.approved',
        entityType: 'documents',
        entityId: documentId,
        metadata: {
          reference: doc.reference,
          version: approvedVersionNumber,
          contentHash: approvedHash,
          underDelegation: authority.underDelegation,
          grandTotal: doc.grandTotal,
        },
      })

      if (doc.submittedBy) {
        await notify(db, actor.id, {
          userId: doc.submittedBy,
          kind: 'document_approved',
          title: `${doc.reference ?? doc.title} approved`,
          body: comment ?? 'The document is approved and ready to issue.',
          entityType: 'documents',
          entityId: documentId,
          href: `/technical/documents/${documentId}`,
        })
      }

      return { status: 'approved', warnings: [...new Set(warnings)] }
    })

    revalidatePath('/approvals')
    revalidatePath('/technical/documents')

    const base =
      outcome.status === 'approved'
        ? 'Approved. The final document has been generated and archived.'
        : outcome.status === 'rejected'
          ? 'Rejected and returned to the Technical Office.'
          : 'Correction requested. The Technical Office has been notified.'

    return {
      ok: true,
      data: { status: outcome.status },
      message: outcome.warnings.length > 0 ? `${base} Note: ${outcome.warnings.join(' ')}` : base,
    }
  } catch (err) {
    return actionError(err)
  }
}

/**
 * Marks an approved document as issued to the client.
 *
 * Separate from approval because approving and sending are different acts by
 * potentially different people, and the client-facing date matters.
 */
export async function issueDocumentAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const documentId = String(formData.get('documentId') ?? '')

    await asActorWith('document.issue', async (db, actor) => {
      const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1)
      if (!doc) throw new NotFoundError('That document no longer exists.')

      if (doc.status !== 'approved') {
        throw new ConflictError('Only an approved document can be issued.')
      }

      await db
        .update(documents)
        .set({ status: 'issued', issuedAt: new Date() })
        .where(eq(documents.id, documentId))

      await db.insert(documentEvents).values({
        documentId,
        actorId: actor.id,
        actorRole: actor.primaryRole,
        action: 'issued',
        fromStatus: 'approved',
        toStatus: 'issued',
      })

      await recordAudit(db, actor, {
        action: 'document.issued',
        entityType: 'documents',
        entityId: documentId,
        metadata: { reference: doc.reference },
      })
    })

    revalidatePath('/technical/documents')
    return { ok: true, data: null, message: 'Marked as issued.' }
  } catch (err) {
    return actionError(err)
  }
}

/**
 * Re-renders a draft so the Technical Officer can preview it.
 *
 * Only ever produces the unsigned rendering, and only for documents that are
 * not yet approved — an approved document's files are fixed at approval and are
 * never regenerated, because regenerating could produce different bytes from
 * the ones that were signed.
 */
export async function previewDocumentAction(
  _prev: ActionResult<{ versionId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ versionId: string }>> {
  try {
    const documentId = String(formData.get('documentId') ?? '')

    const result = await asActorWith('document.edit', async (db, actor) => {
      const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1)
      if (!doc) throw new NotFoundError('That document no longer exists.')

      if (doc.status === 'approved' || doc.status === 'issued') {
        throw new ConflictError(
          'An approved document is not re-rendered. Open the approved version from the repository instead.',
        )
      }

      const snapshot = { preview: true, at: new Date().toISOString(), documentId }
      const [version] = await db
        .insert(documentVersions)
        .values({
          documentId,
          version: doc.currentVersion + 1,
          statusAtCapture: doc.status,
          snapshot,
          contentHash: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
          changeSummary: 'Preview rendering',
          createdBy: actor.id,
        })
        .returning({ id: documentVersions.id })

      await db
        .update(documents)
        .set({ currentVersion: doc.currentVersion + 1 })
        .where(eq(documents.id, documentId))

      const rendered = await renderVersion(db, documentId, version!.id, {
        includeSeals: false,
        filename: doc.filename ?? 'preview.pdf',
      })

      await recordAudit(db, actor, {
        action: 'document.rendered',
        entityType: 'documents',
        entityId: documentId,
        metadata: { preview: true, warnings: rendered.warnings },
      })

      return { versionId: version!.id, warnings: rendered.warnings }
    })

    revalidatePath(`/technical/documents/${documentId}`)
    return {
      ok: true,
      data: { versionId: result.versionId },
      message:
        result.warnings.length > 0
          ? `Preview ready. Note: ${result.warnings.join(' ')}`
          : 'Preview ready.',
    }
  } catch (err) {
    return actionError(err)
  }
}

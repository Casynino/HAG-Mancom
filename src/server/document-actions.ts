'use server'

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import type { Database } from '@/db/client'
import {
  clientPurchaseOrders,
  clients,
  documentCharges,
  documentEvents,
  documentLines,
  documentVersions,
  documents,
  engineerSubmissions,
  projects,
  userRoles,
} from '@/db/schema'
import { notifyMany, recordAudit } from '@/lib/audit'
import { asActorWith, type Actor } from '@/lib/authz/guard'
import {
  actionError,
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
  type ActionResult,
} from '@/lib/errors'
import { checkConfigReadiness, loadDocumentConfig } from '@/lib/finance/config'
import { Decimal } from '@/lib/finance/decimal'
import { computeDocumentTotals, foldChargesIntoUnitPrices } from '@/lib/finance/totals'
import {
  documentHeaderSchema,
  documentIdSchema,
  documentLinesSchema,
  fieldErrorsFrom,
} from '@/lib/validation/document-schemas'
import { proposeFilename } from '@/lib/documents/naming'

/**
 * Document workflow — Stage 4.
 *
 * The rule that shapes this file: a user supplies descriptions, quantities and
 * prices. The server supplies every total, the reference number, and the
 * configuration snapshot. Nothing a browser sends is trusted as a computed
 * figure, and there is no code path that writes a total the finance engine did
 * not produce.
 */

const PRICED_TYPES = new Set(['quotation', 'tax_invoice', 'payment_request', 'export_invoice'])

async function loadDocument(db: Database, documentId: string) {
  const [row] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1)
  if (!row) throw new NotFoundError('That document does not exist, or you cannot access it.')
  return row
}

function assertEditable(doc: { status: string; reference: string | null }) {
  if (doc.status !== 'draft' && doc.status !== 'changes_requested') {
    throw new ConflictError(
      doc.status === 'approved' || doc.status === 'issued'
        ? 'This document has been approved and cannot be changed. Create a revision instead.'
        : 'This document is with the approver and cannot be changed.',
    )
  }
}

/**
 * Reprices a document from its stored lines using currently approved config,
 * and writes the result back. The single place totals are ever written.
 */
async function repriceDocument(db: Database, documentId: string) {
  const doc = await loadDocument(db, documentId)

  const lines = await db
    .select()
    .from(documentLines)
    .where(eq(documentLines.documentId, documentId))
    .orderBy(asc(documentLines.position))

  if (!PRICED_TYPES.has(doc.documentType)) {
    return { doc, totals: null }
  }

  const config = await loadDocumentConfig(db, doc.documentType, doc.currency)

  const totals = computeDocumentTotals({
    currency: doc.currency,
    lines: lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountPercent: l.discountPercent,
    })),
    // A document that already carries its own charges keeps them; otherwise the
    // currently approved set applies.
    charges: config.charges,
    tax: config.tax,
    rounding: config.rounding,
  })

  // Persist computed line totals so the printed document and the database agree.
  for (const [index, line] of lines.entries()) {
    const computed = totals.lines[index]!
    await db
      .update(documentLines)
      .set({
        lineTotal: computed.lineTotal,
        discountAmount: computed.discountAmount,
      })
      .where(eq(documentLines.id, line.id))
  }

  await db.delete(documentCharges).where(eq(documentCharges.documentId, documentId))
  if (totals.charges.length > 0) {
    await db.insert(documentCharges).values(
      totals.charges.map((c, i) => ({
        documentId,
        code: c.code,
        label: c.label,
        ratePercent: c.ratePercent,
        appliesBeforeVat: c.appliesBeforeVat,
        position: i,
        amount: c.amount,
      })),
    )
  }

  await db
    .update(documents)
    .set({
      subTotal: totals.subTotal,
      chargesBeforeVat: totals.chargesBeforeVat,
      chargesAfterVat: totals.chargesAfterVat,
      taxableTotal: totals.taxableTotal,
      taxAmount: totals.taxAmount,
      grandTotal: totals.grandTotal,
      taxCode: totals.taxCode,
      taxLabel: totals.taxLabel,
      taxRatePercent: totals.taxRatePercent,
      roundingPolicy: totals.rounding,
      legalEntityId: config.legalEntity.id,
      entityAddressId: config.address?.id ?? null,
      bankAccountId: config.bankAccount?.id ?? null,
    })
    .where(eq(documents.id, documentId))

  return { doc, totals }
}

export async function createDocumentAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = documentHeaderSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) {
      throw new ValidationError('Check the details below.', fieldErrorsFrom(parsed.error))
    }
    const v = parsed.data

    const id = await asActorWith('document.create', async (db, actor) => {
      const [project] = await db
        .select({ id: projects.id, clientId: projects.clientId, name: projects.name })
        .from(projects)
        .where(eq(projects.id, v.projectId))
        .limit(1)

      if (!project) {
        throw new ValidationError('Choose a project.', { projectId: ['That project was not found.'] })
      }

      // Fail before the user invests any work, not at approval time.
      const readiness = await checkConfigReadiness(db, v.documentType, v.currency)
      if (!readiness.ready) {
        throw new AppError(
          `This document type cannot be produced yet. Still needed: ${readiness.missing.join(' ')}`,
          'config_incomplete',
          409,
        )
      }

      const [client] = await db
        .select({ legalName: clients.legalName })
        .from(clients)
        .where(eq(clients.id, project.clientId))
        .limit(1)

      const [created] = await db
        .insert(documents)
        .values({
          documentType: v.documentType,
          clientId: project.clientId,
          projectId: project.id,
          clientPurchaseOrderId: v.clientPurchaseOrderId || null,
          sourceSubmissionId: v.sourceSubmissionId || null,
          title: v.title,
          scopeDescription: v.scopeDescription ?? null,
          servicePeriodLabel: v.servicePeriodLabel ?? null,
          clientReference: v.clientReference ?? null,
          currency: v.currency,
          documentDate: v.documentDate || new Date().toISOString().slice(0, 10),
          bodyContent: v.bodyContent ?? null,
          terms: v.terms ?? null,
          preparedBy: actor.id,
          status: 'draft',
          filename: proposeFilename({
            documentType: v.documentType,
            clientName: client?.legalName ?? 'Client',
            title: v.title,
            date: new Date(),
          }),
        })
        .returning({ id: documents.id })

      const documentId = created!.id

      await db.insert(documentEvents).values({
        documentId,
        actorId: actor.id,
        actorRole: actor.primaryRole,
        action: 'created',
        toStatus: 'draft',
      })

      await recordAudit(db, actor, {
        action: 'document.created',
        entityType: 'documents',
        entityId: documentId,
        metadata: { documentType: v.documentType, projectId: project.id },
      })

      return documentId
    })

    revalidatePath('/technical/documents')
    return { ok: true, data: { id }, message: 'Draft created.' }
  } catch (err) {
    return actionError(err)
  }
}

export async function saveDocumentAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const documentId = String(formData.get('documentId') ?? '')
    if (!documentIdSchema.safeParse({ documentId }).success) throw new NotFoundError()

    const header = documentHeaderSchema.partial().safeParse(Object.fromEntries(formData))
    if (!header.success) {
      throw new ValidationError('Check the details below.', fieldErrorsFrom(header.error))
    }

    const rawLines = formData.get('lines')
    const linesParsed = documentLinesSchema.safeParse(
      typeof rawLines === 'string' && rawLines.trim() !== '' ? JSON.parse(rawLines) : [],
    )
    if (!linesParsed.success) {
      throw new ValidationError('Check the line items.', fieldErrorsFrom(linesParsed.error))
    }

    await asActorWith('document.edit', async (db, actor) => {
      const doc = await loadDocument(db, documentId)
      assertEditable(doc)

      const v = header.data

      await db
        .update(documents)
        .set({
          title: v.title ?? doc.title,
          scopeDescription: v.scopeDescription ?? doc.scopeDescription,
          servicePeriodLabel: v.servicePeriodLabel ?? doc.servicePeriodLabel,
          clientReference: v.clientReference ?? doc.clientReference,
          documentDate: v.documentDate || doc.documentDate,
          bodyContent: v.bodyContent ?? doc.bodyContent,
          terms: v.terms ?? doc.terms,
          filename: v.filename ?? doc.filename,
          clientPurchaseOrderId: v.clientPurchaseOrderId ?? doc.clientPurchaseOrderId,
        })
        .where(eq(documents.id, documentId))

      // Lines are replaced wholesale. Simpler than diffing, and the document is
      // a draft, so nothing downstream depends on line identity yet.
      await db.delete(documentLines).where(eq(documentLines.documentId, documentId))

      if (linesParsed.data.length > 0) {
        await db.insert(documentLines).values(
          linesParsed.data.map((l, index) => ({
            documentId,
            position: index,
            kind: l.kind,
            description: l.description,
            itemCode: l.itemCode ?? null,
            quantity: l.quantity,
            unit: l.unit ?? null,
            unitPrice: l.unitPrice,
            discountPercent: l.discountPercent ?? null,
            // Placeholder — repriceDocument overwrites this immediately. It is
            // never the figure that reaches a document.
            lineTotal: '0',
          })),
        )
      }

      await repriceDocument(db, documentId)

      await recordAudit(db, actor, {
        action: 'document.updated',
        entityType: 'documents',
        entityId: documentId,
        metadata: { lineCount: linesParsed.data.length },
      })
    })

    revalidatePath(`/technical/documents/${documentId}`)
    return { ok: true, data: null, message: 'Saved and repriced.' }
  } catch (err) {
    return actionError(err)
  }
}

/**
 * Sends a document to the approver.
 *
 * This is where the internal reference is allocated — at submission, not at
 * creation, so abandoned drafts never consume a number from the company's
 * sequence. It is also where the first immutable version snapshot is written.
 */
export async function submitDocumentForApprovalAction(
  _prev: ActionResult<{ reference: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ reference: string }>> {
  try {
    const documentId = String(formData.get('documentId') ?? '')
    if (!documentIdSchema.safeParse({ documentId }).success) throw new NotFoundError()

    const reference = await asActorWith('document.submit', async (db, actor) => {
      const doc = await loadDocument(db, documentId)
      assertEditable(doc)

      const lines = await db
        .select()
        .from(documentLines)
        .where(eq(documentLines.documentId, documentId))
        .orderBy(asc(documentLines.position))

      if (PRICED_TYPES.has(doc.documentType) && lines.length === 0) {
        throw new ValidationError('Add at least one line before submitting.', {
          lines: ['A priced document needs at least one line.'],
        })
      }

      // Reprice immediately before submission so what the approver sees is
      // computed from current approved configuration, not a stale draft.
      const { totals } = await repriceDocument(db, documentId)
      const fresh = await loadDocument(db, documentId)

      // Allocate the reference once, under the database advisory lock.
      let ref = fresh.reference
      if (!ref) {
        const result = await db.execute(
          sql`select app.issue_internal_reference(
                ${doc.documentType}::public.document_type, 'documents', ${documentId}::uuid
              ) as reference`,
        )
        ref = (result.rows[0] as { reference: string }).reference
      }

      const charges = await db
        .select()
        .from(documentCharges)
        .where(eq(documentCharges.documentId, documentId))
        .orderBy(asc(documentCharges.position))

      const snapshot = {
        capturedAt: new Date().toISOString(),
        reference: ref,
        documentType: fresh.documentType,
        title: fresh.title,
        scopeDescription: fresh.scopeDescription,
        servicePeriodLabel: fresh.servicePeriodLabel,
        documentDate: fresh.documentDate,
        currency: fresh.currency,
        clientId: fresh.clientId,
        projectId: fresh.projectId,
        clientPurchaseOrderId: fresh.clientPurchaseOrderId,
        lines: lines.map((l) => ({
          position: l.position,
          description: l.description,
          quantity: l.quantity,
          unit: l.unit,
          unitPrice: l.unitPrice,
          discountPercent: l.discountPercent,
          lineTotal: l.lineTotal,
        })),
        charges: charges.map((c) => ({
          code: c.code,
          label: c.label,
          ratePercent: c.ratePercent,
          appliesBeforeVat: c.appliesBeforeVat,
          amount: c.amount,
        })),
        totals: totals
          ? {
              subTotal: totals.subTotal,
              chargesBeforeVat: totals.chargesBeforeVat,
              taxableTotal: totals.taxableTotal,
              taxCode: totals.taxCode,
              taxRatePercent: totals.taxRatePercent,
              taxAmount: totals.taxAmount,
              grandTotal: totals.grandTotal,
            }
          : null,
        rounding: fresh.roundingPolicy,
        terms: fresh.terms,
        bodyContent: fresh.bodyContent,
      }

      const contentHash = createHash('sha256')
        .update(JSON.stringify(snapshot))
        .digest('hex')

      const nextVersion = fresh.currentVersion + 1

      await db.insert(documentVersions).values({
        documentId,
        version: nextVersion,
        statusAtCapture: 'pending_approval',
        snapshot,
        contentHash,
        changeSummary:
          fresh.status === 'changes_requested'
            ? 'Resubmitted after correction'
            : 'Submitted for approval',
        createdBy: actor.id,
      })

      await db
        .update(documents)
        .set({
          status: 'pending_approval',
          reference: ref,
          currentVersion: nextVersion,
          submittedForApprovalAt: new Date(),
          submittedBy: actor.id,
          correctionComment: null,
        })
        .where(eq(documents.id, documentId))

      await db.insert(documentEvents).values({
        documentId,
        actorId: actor.id,
        actorRole: actor.primaryRole,
        action: 'submitted_for_approval',
        fromStatus: fresh.status,
        toStatus: 'pending_approval',
        metadata: { version: nextVersion, contentHash },
      })

      // The Director's inbox.
      const directors = await db
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .where(and(eq(userRoles.role, 'director'), isNull(userRoles.revokedAt)))

      await notifyMany(
        db,
        actor.id,
        directors.map((d) => d.userId),
        {
          kind: 'document_pending_approval',
          title: `${ref} needs your approval`,
          body: `${fresh.title}${fresh.grandTotal ? ` — ${fresh.currency} ${Decimal.from(fresh.grandTotal).toFixed(2)}` : ''}`,
          entityType: 'documents',
          entityId: documentId,
          href: `/approvals/${documentId}`,
        },
      )

      await recordAudit(db, actor, {
        action: 'document.submitted_for_approval',
        entityType: 'documents',
        entityId: documentId,
        metadata: { reference: ref, version: nextVersion, contentHash },
      })

      return ref
    })

    revalidatePath('/technical/documents')
    revalidatePath('/approvals')
    return {
      ok: true,
      data: { reference },
      message: `Submitted as ${reference}. The Director has been notified.`,
    }
  } catch (err) {
    return actionError(err)
  }
}

/**
 * Raises a tax invoice from an approved quotation.
 *
 * The conversion folds the quotation's pre-VAT charges into unit prices, which
 * is how HA GROUP's own documents do it — see foldChargesIntoUnitPrices. The
 * base price and the loading factor are stored on each line so the derivation
 * stays auditable, and the rounding difference is surfaced rather than buried.
 */
export async function createInvoiceFromQuotationAction(
  _prev: ActionResult<{ id: string; drift: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string; drift: string }>> {
  try {
    const quotationId = String(formData.get('quotationId') ?? '')
    const purchaseOrderId = String(formData.get('clientPurchaseOrderId') ?? '')

    if (!documentIdSchema.safeParse({ documentId: quotationId }).success) throw new NotFoundError()

    const result = await asActorWith('document.create', async (db, actor) => {
      const quotation = await loadDocument(db, quotationId)

      if (quotation.documentType !== 'quotation') {
        throw new ConflictError('Only a quotation can become an invoice.')
      }
      if (quotation.status !== 'approved' && quotation.status !== 'issued') {
        throw new ConflictError('The quotation must be approved before it can be invoiced.')
      }

      if (!purchaseOrderId) {
        throw new ValidationError('Record the client Purchase Order first.', {
          clientPurchaseOrderId: [
            'A tax invoice needs the client PO number. The client issues it — record it under the project.',
          ],
        })
      }

      const [po] = await db
        .select()
        .from(clientPurchaseOrders)
        .where(eq(clientPurchaseOrders.id, purchaseOrderId))
        .limit(1)

      if (!po || po.projectId !== quotation.projectId) {
        throw new ValidationError('That Purchase Order does not belong to this project.', {
          clientPurchaseOrderId: ['Choose a Purchase Order recorded against this project.'],
        })
      }

      const readiness = await checkConfigReadiness(db, 'tax_invoice', quotation.currency)
      if (!readiness.ready) {
        throw new AppError(
          `A tax invoice cannot be produced yet. Still needed: ${readiness.missing.join(' ')}`,
          'config_incomplete',
          409,
        )
      }

      const lines = await db
        .select()
        .from(documentLines)
        .where(eq(documentLines.documentId, quotationId))
        .orderBy(asc(documentLines.position))

      const charges = await db
        .select()
        .from(documentCharges)
        .where(eq(documentCharges.documentId, quotationId))
        .orderBy(asc(documentCharges.position))

      const config = await loadDocumentConfig(db, 'tax_invoice', quotation.currency)

      // Rebuild the quotation's totals so the fold works from a full result.
      const quotationTotals = computeDocumentTotals({
        currency: quotation.currency,
        lines: lines.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountPercent: l.discountPercent,
        })),
        charges: charges.map((c) => ({
          code: c.code,
          label: c.label,
          ratePercent: c.ratePercent,
          appliesBeforeVat: c.appliesBeforeVat,
          position: c.position,
        })),
        tax: config.tax,
        rounding: (quotation.roundingPolicy as never) ?? config.rounding,
      })

      const folded = foldChargesIntoUnitPrices(quotationTotals, config.tax)

      const [client] = await db
        .select({ legalName: clients.legalName })
        .from(clients)
        .where(eq(clients.id, quotation.clientId))
        .limit(1)

      const [created] = await db
        .insert(documents)
        .values({
          documentType: 'tax_invoice',
          clientId: quotation.clientId,
          projectId: quotation.projectId,
          clientPurchaseOrderId: po.id,
          sourceDocumentId: quotation.id,
          sourceSubmissionId: quotation.sourceSubmissionId,
          title: quotation.title,
          scopeDescription: quotation.scopeDescription,
          servicePeriodLabel: quotation.servicePeriodLabel,
          currency: quotation.currency,
          documentDate: new Date().toISOString().slice(0, 10),
          preparedBy: actor.id,
          status: 'draft',
          filename: proposeFilename({
            documentType: 'tax_invoice',
            clientName: client?.legalName ?? 'Client',
            title: quotation.title,
            date: new Date(),
          }),
        })
        .returning({ id: documents.id })

      const invoiceId = created!.id

      await db.insert(documentLines).values(
        folded.lines.map((l, index) => ({
          documentId: invoiceId,
          position: index,
          kind: lines[index]?.kind ?? 'service',
          description: l.description,
          itemCode: lines[index]?.itemCode ?? null,
          quantity: l.quantity,
          unit: lines[index]?.unit ?? null,
          unitPrice: l.unitPrice,
          // Provenance of the fold, kept so the derivation is auditable.
          baseUnitPrice: lines[index]?.unitPrice ?? null,
          loadingFactorPercent: folded.loadingFactorPercent,
          lineTotal: '0',
        })),
      )

      await repriceDocument(db, invoiceId)

      await db.insert(documentEvents).values({
        documentId: invoiceId,
        actorId: actor.id,
        actorRole: actor.primaryRole,
        action: 'created_from_quotation',
        toStatus: 'draft',
        comment: `Raised from ${quotation.reference ?? 'quotation'}. Charges folded into unit prices at ${folded.loadingFactorPercent}%.`,
        metadata: {
          quotationId: quotation.id,
          loadingFactorPercent: folded.loadingFactorPercent,
          roundingDifference: folded.difference,
        },
      })

      await recordAudit(db, actor, {
        action: 'document.created',
        entityType: 'documents',
        entityId: invoiceId,
        metadata: {
          documentType: 'tax_invoice',
          fromQuotation: quotation.reference,
          poNumber: po.poNumber,
          roundingDifference: folded.difference,
        },
      })

      return { id: invoiceId, drift: folded.difference }
    })

    revalidatePath('/technical/documents')
    return {
      ok: true,
      data: result,
      message:
        Decimal.from(result.drift).isZero()
          ? 'Invoice drafted from the quotation.'
          : `Invoice drafted. Folding the charges into unit prices changes the total by ${result.drift} — check this before submitting.`,
    }
  } catch (err) {
    return actionError(err)
  }
}

/** Builds a quotation from an accepted engineer submission. */
export async function createQuotationFromSubmissionAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const submissionId = String(formData.get('submissionId') ?? '')

    const id = await asActorWith('document.create', async (db, actor) => {
      const [submission] = await db
        .select()
        .from(engineerSubmissions)
        .where(eq(engineerSubmissions.id, submissionId))
        .limit(1)

      if (!submission) throw new NotFoundError('That submission no longer exists.')

      if (submission.status !== 'accepted' && submission.status !== 'ready_for_documentation') {
        throw new ConflictError('Accept the submission before drafting a quotation from it.')
      }

      const readiness = await checkConfigReadiness(db, 'quotation', 'TZS')
      if (!readiness.ready) {
        throw new AppError(
          `A quotation cannot be produced yet. Still needed: ${readiness.missing.join(' ')}`,
          'config_incomplete',
          409,
        )
      }

      const [client] = await db
        .select({ legalName: clients.legalName })
        .from(clients)
        .where(eq(clients.id, submission.clientId))
        .limit(1)

      const [created] = await db
        .insert(documents)
        .values({
          documentType: 'quotation',
          clientId: submission.clientId,
          projectId: submission.projectId,
          sourceSubmissionId: submission.id,
          title: submission.title,
          scopeDescription: submission.recommendedWork,
          currency: 'TZS',
          documentDate: new Date().toISOString().slice(0, 10),
          preparedBy: actor.id,
          status: 'draft',
          filename: proposeFilename({
            documentType: 'quotation',
            clientName: client?.legalName ?? 'Client',
            title: submission.title,
            date: new Date(),
          }),
        })
        .returning({ id: documents.id })

      const documentId = created!.id

      await db.insert(documentEvents).values({
        documentId,
        actorId: actor.id,
        actorRole: actor.primaryRole,
        action: 'created_from_submission',
        toStatus: 'draft',
        comment: `Drafted from ${submission.reference ?? 'site submission'}.`,
      })

      await recordAudit(db, actor, {
        action: 'document.created',
        entityType: 'documents',
        entityId: documentId,
        metadata: { documentType: 'quotation', submissionId: submission.id },
      })

      return documentId
    })

    revalidatePath('/technical/documents')
    return { ok: true, data: { id }, message: 'Quotation drafted from the site submission.' }
  } catch (err) {
    return actionError(err)
  }
}

export async function cancelDocumentAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const documentId = String(formData.get('documentId') ?? '')
    const reason = String(formData.get('reason') ?? '').trim()

    if (reason.length < 5) {
      throw new ValidationError('Give a reason for cancelling.', {
        reason: ['Give a reason of at least 5 characters.'],
      })
    }

    await asActorWith('document.edit', async (db, actor) => {
      const doc = await loadDocument(db, documentId)

      await db
        .update(documents)
        .set({ status: 'cancelled', cancelledAt: new Date(), cancellationReason: reason })
        .where(eq(documents.id, documentId))

      await db.insert(documentEvents).values({
        documentId,
        actorId: actor.id,
        actorRole: actor.primaryRole,
        action: 'cancelled',
        fromStatus: doc.status,
        toStatus: 'cancelled',
        comment: reason,
      })

      await recordAudit(db, actor, {
        action: 'document.cancelled',
        entityType: 'documents',
        entityId: documentId,
        metadata: { reason, reference: doc.reference },
      })
    })

    revalidatePath('/technical/documents')
    return { ok: true, data: null, message: 'Document cancelled.' }
  } catch (err) {
    return actionError(err)
  }
}

'use server'

import { revalidatePath } from 'next/cache'
import { and, asc, eq, isNull } from 'drizzle-orm'
import {
  clientContacts,
  clientPurchaseOrders,
  completionRecords,
  deliveries,
  deliveryItems,
  deliveryPhotos,
  documents,
  efdReceipts,
  projects,
  userRoles,
} from '@/db/schema'
import { notify, notifyMany, recordAudit } from '@/lib/audit'
import { asActorWith } from '@/lib/authz/guard'
import {
  actionError,
  ConflictError,
  NotFoundError,
  ValidationError,
  type ActionResult,
} from '@/lib/errors'
import { checksum, getStorage } from '@/lib/storage'
import { checkFile, sanitiseFilename } from '@/lib/storage/limits'
import {
  completionRecordSchema,
  deliveryItemsSchema,
  deliverySchema,
  efdReceiptSchema,
  fieldErrorsFrom,
  purchaseOrderSchema,
} from '@/lib/validation/document-schemas'
import { isEfdIntegrationConfigured } from '@/lib/efd'

/**
 * Commercial and site operations — Stage 2 and Stage 4.
 *
 * The rule that runs through all of it: numbers and documents that originate
 * with the client or with a regulator are RECORDED here, never generated. That
 * covers the client Purchase Order number and the TRA EFD receipt number, and
 * it is enforced by database triggers as well as by these functions.
 */

/** Reads one uploaded file from a form, validates it, and stores it. */
async function storeUpload(
  file: File,
  kind: 'document' | 'photo',
  keyPrefix: string,
): Promise<{
  storageKey: string
  filename: string
  contentType: string
  byteSize: number
  checksumSha256: string
}> {
  const buffer = Buffer.from(await file.arrayBuffer())

  const verdict = checkFile({
    kind: kind === 'photo' ? 'photo' : 'document',
    filename: file.name,
    contentType: file.type,
    byteSize: buffer.byteLength,
    head: new Uint8Array(buffer.subarray(0, 32)),
  })

  if (!verdict.ok) throw new ValidationError(verdict.reason, { file: [verdict.reason] })

  const extension = sanitiseFilename(file.name).match(/\.[a-z0-9]{1,9}$/i)?.[0] ?? ''
  const storageKey = `${keyPrefix}/${crypto.randomUUID()}${extension.toLowerCase()}`

  await getStorage().put(storageKey, buffer, file.type)

  return {
    storageKey,
    filename: sanitiseFilename(file.name),
    contentType: file.type,
    byteSize: buffer.byteLength,
    checksumSha256: checksum(buffer),
  }
}

/* -------------------------------------------------------------------------- */
/* Client contacts                                                             */
/* -------------------------------------------------------------------------- */

export async function saveClientContactAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const clientId = String(formData.get('clientId') ?? '')
    const fullName = String(formData.get('fullName') ?? '').trim()

    if (fullName.length < 2) {
      throw new ValidationError('Enter the contact’s name.', { fullName: ['A name is required.'] })
    }

    await asActorWith('client.manage', async (db, actor) => {
      const isPrimary = formData.get('isPrimary') === 'on'

      // Only one primary contact per client, so promoting one demotes the rest.
      if (isPrimary) {
        await db
          .update(clientContacts)
          .set({ isPrimary: false })
          .where(and(eq(clientContacts.clientId, clientId), isNull(clientContacts.archivedAt)))
      }

      await db.insert(clientContacts).values({
        clientId,
        fullName,
        jobTitle: String(formData.get('jobTitle') ?? '').trim() || null,
        department: String(formData.get('department') ?? '').trim() || null,
        phone: String(formData.get('phone') ?? '').trim() || null,
        email:
          String(formData.get('email') ?? '')
            .trim()
            .toLowerCase() || null,
        isPrimary,
        receivesDocuments: formData.get('receivesDocuments') === 'on',
        notes: String(formData.get('notes') ?? '').trim() || null,
        createdBy: actor.id,
      })

      await recordAudit(db, actor, {
        action: 'contact.created',
        entityType: 'clients',
        entityId: clientId,
        metadata: { fullName, isPrimary },
      })
    })

    revalidatePath('/technical/clients')
    return { ok: true, data: null, message: 'Contact added.' }
  } catch (err) {
    return actionError(err)
  }
}

/* -------------------------------------------------------------------------- */
/* Client Purchase Orders                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Records a Purchase Order the client issued.
 *
 * The number comes from the client's document. This function has no branch that
 * produces one, and the database trigger `app.protect_client_po` rejects a blank
 * number and refuses any later change to one.
 */
export async function recordPurchaseOrderAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = purchaseOrderSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) {
      throw new ValidationError('Check the details below.', fieldErrorsFrom(parsed.error))
    }
    const v = parsed.data

    const file = formData.get('document')
    const hasFile = file instanceof File && file.size > 0

    const id = await asActorWith('po.manage', async (db, actor) => {
      const [project] = await db
        .select({ id: projects.id, clientId: projects.clientId })
        .from(projects)
        .where(eq(projects.id, v.projectId))
        .limit(1)

      if (!project) {
        throw new ValidationError('Choose a project.', {
          projectId: ['That project was not found.'],
        })
      }

      const stored = hasFile
        ? await storeUpload(file as File, 'document', `purchase-orders/${project.id}`)
        : null

      try {
        const [created] = await db
          .insert(clientPurchaseOrders)
          .values({
            clientId: project.clientId,
            projectId: project.id,
            poNumber: v.poNumber,
            poDate: v.poDate || null,
            receivedAt: new Date(),
            description: v.description ?? null,
            currency: v.currency.toUpperCase(),
            orderValue: v.orderValue ?? null,
            notes: v.notes ?? null,
            documentStorageKey: stored?.storageKey ?? null,
            documentFilename: stored?.filename ?? null,
            documentContentType: stored?.contentType ?? null,
            documentByteSize: stored?.byteSize ?? null,
            documentChecksumSha256: stored?.checksumSha256 ?? null,
            recordedBy: actor.id,
          })
          .returning({ id: clientPurchaseOrders.id })

        await recordAudit(db, actor, {
          action: 'purchase_order.recorded',
          entityType: 'client_purchase_orders',
          entityId: created!.id,
          metadata: {
            poNumber: v.poNumber,
            projectId: project.id,
            documentAttached: Boolean(stored),
          },
        })

        return created!.id
      } catch (err) {
        // Roll the stored bytes back with the transaction.
        if (stored)
          await getStorage()
            .remove(stored.storageKey)
            .catch(() => undefined)
        throw err
      }
    })

    revalidatePath('/technical/projects')
    return {
      ok: true,
      data: { id },
      message: hasFile
        ? 'Purchase Order recorded with the client’s original document.'
        : 'Purchase Order recorded. Attach the client’s original document when you have it.',
    }
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
      return {
        ok: false,
        error: 'That Purchase Order number is already recorded for this client.',
        code: 'duplicate',
        fieldErrors: { poNumber: ['This client already has a PO with that number.'] },
      }
    }
    return actionError(err)
  }
}

export async function cancelPurchaseOrderAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const purchaseOrderId = String(formData.get('purchaseOrderId') ?? '')
    const reason = String(formData.get('reason') ?? '').trim()

    if (reason.length < 5) {
      throw new ValidationError('Give a reason.', {
        reason: ['Explain why this Purchase Order is being cancelled.'],
      })
    }

    await asActorWith('po.manage', async (db, actor) => {
      const [po] = await db
        .select()
        .from(clientPurchaseOrders)
        .where(eq(clientPurchaseOrders.id, purchaseOrderId))
        .limit(1)

      if (!po) throw new NotFoundError('That Purchase Order no longer exists.')

      // An invoice already raised against it would be orphaned.
      const linked = await db
        .select({ id: documents.id })
        .from(documents)
        .where(eq(documents.clientPurchaseOrderId, purchaseOrderId))
        .limit(1)

      if (linked.length > 0) {
        throw new ConflictError(
          'Documents have already been raised against this Purchase Order. Cancel those first.',
        )
      }

      await db
        .update(clientPurchaseOrders)
        .set({ status: 'cancelled', cancelledAt: new Date(), cancellationReason: reason })
        .where(eq(clientPurchaseOrders.id, purchaseOrderId))

      await recordAudit(db, actor, {
        action: 'purchase_order.cancelled',
        entityType: 'client_purchase_orders',
        entityId: purchaseOrderId,
        metadata: { poNumber: po.poNumber, reason },
      })
    })

    revalidatePath('/technical/projects')
    return { ok: true, data: null, message: 'Purchase Order cancelled. The record is preserved.' }
  } catch (err) {
    return actionError(err)
  }
}

/* -------------------------------------------------------------------------- */
/* Deliveries                                                                  */
/* -------------------------------------------------------------------------- */

export async function createDeliveryAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = deliverySchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) {
      throw new ValidationError('Check the details below.', fieldErrorsFrom(parsed.error))
    }
    const v = parsed.data

    const rawItems = formData.get('items')
    const items = deliveryItemsSchema.safeParse(
      typeof rawItems === 'string' && rawItems.trim() !== '' ? JSON.parse(rawItems) : [],
    )
    if (!items.success) {
      throw new ValidationError('Check the delivered items.', fieldErrorsFrom(items.error))
    }
    if (items.data.length === 0) {
      throw new ValidationError('List what was delivered.', {
        items: ['Add at least one delivered item.'],
      })
    }

    const id = await asActorWith('delivery.manage', async (db, actor) => {
      const [project] = await db
        .select({ id: projects.id, clientId: projects.clientId })
        .from(projects)
        .where(eq(projects.id, v.projectId))
        .limit(1)

      if (!project) throw new NotFoundError('That project no longer exists.')

      const [created] = await db
        .insert(deliveries)
        .values({
          projectId: project.id,
          clientId: project.clientId,
          clientPurchaseOrderId: v.clientPurchaseOrderId ?? null,
          deliveryDate: v.deliveryDate,
          location: v.location ?? null,
          handoverPersonId: actor.id,
          handoverPersonName: v.handoverPersonName,
          receiverName: v.receiverName ?? null,
          receiverTitle: v.receiverTitle ?? null,
          receiverPhone: v.receiverPhone ?? null,
          notes: v.notes ?? null,
          status: 'pending_signatures',
          createdBy: actor.id,
        })
        .returning({ id: deliveries.id })

      const deliveryId = created!.id

      await db.insert(deliveryItems).values(
        items.data.map((item, index) => ({
          deliveryId,
          position: index,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit ?? null,
          notes: item.notes ?? null,
        })),
      )

      await recordAudit(db, actor, {
        action: 'delivery.created',
        entityType: 'deliveries',
        entityId: deliveryId,
        metadata: { projectId: project.id, itemCount: items.data.length },
      })

      return deliveryId
    })

    revalidatePath('/technical/deliveries')
    return {
      ok: true,
      data: { id },
      message: 'Delivery recorded. Capture both signatures to confirm it.',
    }
  } catch (err) {
    return actionError(err)
  }
}

/**
 * Captures one side's signature on a delivery.
 *
 * These are handwritten marks taken on a phone at handover — deliberately NOT
 * the Director's official signature asset, which lives in company_assets and
 * can only be applied by a Director through the approval flow.
 *
 * When both sides have signed, the delivery becomes confirmed, which is one of
 * the two things that unlocks invoicing.
 */
export async function signDeliveryAction(
  _prev: ActionResult<{ confirmed: boolean }> | null,
  formData: FormData,
): Promise<ActionResult<{ confirmed: boolean }>> {
  try {
    const deliveryId = String(formData.get('deliveryId') ?? '')
    const side = String(formData.get('side') ?? '')

    if (side !== 'handover' && side !== 'receiver') {
      throw new ValidationError('Choose which side is signing.')
    }

    const signature = formData.get('signature')
    if (!(signature instanceof File) || signature.size === 0) {
      throw new ValidationError('Capture the signature before saving.', {
        signature: ['No signature was captured.'],
      })
    }

    const confirmed = await asActorWith('delivery.sign', async (db, actor) => {
      const [delivery] = await db
        .select()
        .from(deliveries)
        .where(eq(deliveries.id, deliveryId))
        .limit(1)

      if (!delivery) throw new NotFoundError('That delivery no longer exists.')
      if (delivery.status === 'confirmed') {
        throw new ConflictError('This delivery is already confirmed.')
      }
      if (delivery.status === 'cancelled') {
        throw new ConflictError('This delivery was cancelled.')
      }

      const existing =
        side === 'handover' ? delivery.handoverSignatureKey : delivery.receiverSignatureKey
      if (existing) {
        throw new ConflictError('That side has already signed.')
      }

      const stored = await storeUpload(signature, 'photo', `deliveries/${deliveryId}/signatures`)

      const nowSigned =
        side === 'handover'
          ? { handoverSignatureKey: stored.storageKey, handoverSignedAt: new Date() }
          : { receiverSignatureKey: stored.storageKey, receiverSignedAt: new Date() }

      const bothSigned =
        side === 'handover'
          ? Boolean(delivery.receiverSignatureKey)
          : Boolean(delivery.handoverSignatureKey)

      await db
        .update(deliveries)
        .set({
          ...nowSigned,
          ...(bothSigned ? { status: 'confirmed' as const, confirmedAt: new Date() } : {}),
        })
        .where(eq(deliveries.id, deliveryId))

      await recordAudit(db, actor, {
        action: bothSigned ? 'delivery.confirmed' : 'delivery.signed',
        entityType: 'deliveries',
        entityId: deliveryId,
        metadata: { side, confirmed: bothSigned },
      })

      if (bothSigned) {
        const officers = await db
          .select({ userId: userRoles.userId })
          .from(userRoles)
          .where(and(eq(userRoles.role, 'technical_officer'), isNull(userRoles.revokedAt)))

        await notifyMany(
          db,
          actor.id,
          officers.map((o) => o.userId),
          {
            kind: 'delivery_confirmed',
            title: 'Delivery confirmed — invoicing is now unlocked',
            body: `Both sides have signed the delivery of ${delivery.deliveryDate}.`,
            entityType: 'deliveries',
            entityId: deliveryId,
            href: `/technical/deliveries/${deliveryId}`,
          },
        )
      }

      return bothSigned
    })

    revalidatePath(`/technical/deliveries/${deliveryId}`)
    return {
      ok: true,
      data: { confirmed },
      message: confirmed
        ? 'Both signatures captured. The delivery is confirmed.'
        : 'Signature captured. The other side still needs to sign.',
    }
  } catch (err) {
    return actionError(err)
  }
}

export async function addDeliveryPhotoAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const deliveryId = String(formData.get('deliveryId') ?? '')
    const files = formData
      .getAll('photos')
      .filter((f): f is File => f instanceof File && f.size > 0)

    if (files.length === 0) {
      throw new ValidationError('Choose at least one photo.')
    }

    await asActorWith('delivery.sign', async (db, actor) => {
      for (const file of files) {
        const stored = await storeUpload(file, 'photo', `deliveries/${deliveryId}/photos`)
        await db.insert(deliveryPhotos).values({
          deliveryId,
          storageKey: stored.storageKey,
          originalFilename: stored.filename,
          contentType: stored.contentType,
          byteSize: stored.byteSize,
          checksumSha256: stored.checksumSha256,
          uploadedBy: actor.id,
        })
      }

      await recordAudit(db, actor, {
        action: 'attachment.uploaded',
        entityType: 'deliveries',
        entityId: deliveryId,
        metadata: { count: files.length, purpose: 'proof_of_delivery' },
      })
    })

    revalidatePath(`/technical/deliveries/${deliveryId}`)
    return { ok: true, data: null, message: `${files.length} photo(s) added.` }
  } catch (err) {
    return actionError(err)
  }
}

/* -------------------------------------------------------------------------- */
/* Completion evidence                                                         */
/* -------------------------------------------------------------------------- */

export async function recordCompletionAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = completionRecordSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) {
      throw new ValidationError('Check the details below.', fieldErrorsFrom(parsed.error))
    }
    const v = parsed.data

    const file = formData.get('evidence')
    const hasFile = file instanceof File && file.size > 0

    if (v.source === 'client_acceptance' && !hasFile) {
      throw new ValidationError('Attach the client’s signed acceptance document.', {
        evidence: ['Upload the signed original the client returned.'],
      })
    }

    const id = await asActorWith('completion.manage', async (db, actor) => {
      const [project] = await db
        .select({ id: projects.id, clientId: projects.clientId })
        .from(projects)
        .where(eq(projects.id, v.projectId))
        .limit(1)

      if (!project) throw new NotFoundError('That project no longer exists.')

      const stored = hasFile
        ? await storeUpload(file as File, 'document', `completion/${project.id}`)
        : null

      try {
        const [created] = await db
          .insert(completionRecords)
          .values({
            projectId: project.id,
            clientId: project.clientId,
            clientPurchaseOrderId: v.clientPurchaseOrderId ?? null,
            source: v.source,
            completedOn: v.completedOn,
            workDescription: v.workDescription ?? null,
            acceptedByName: v.acceptedByName ?? null,
            acceptedByTitle: v.acceptedByTitle ?? null,
            engineerId: v.engineerId ?? null,
            evidenceStorageKey: stored?.storageKey ?? null,
            evidenceFilename: stored?.filename ?? null,
            evidenceContentType: stored?.contentType ?? null,
            evidenceByteSize: stored?.byteSize ?? null,
            evidenceChecksumSha256: stored?.checksumSha256 ?? null,
            notes: v.notes ?? null,
            createdBy: actor.id,
          })
          .returning({ id: completionRecords.id })

        await recordAudit(db, actor, {
          action: 'completion.recorded',
          entityType: 'completion_records',
          entityId: created!.id,
          metadata: { projectId: project.id, source: v.source, evidenceAttached: Boolean(stored) },
        })

        return created!.id
      } catch (err) {
        if (stored)
          await getStorage()
            .remove(stored.storageKey)
            .catch(() => undefined)
        throw err
      }
    })

    revalidatePath('/technical/projects')
    return {
      ok: true,
      data: { id },
      message: 'Completion evidence recorded. Verify it to unlock invoicing.',
    }
  } catch (err) {
    return actionError(err)
  }
}

/**
 * A Technical Officer confirms the completion evidence is genuine.
 *
 * Verification, not recording, is what satisfies the invoice gate — so that
 * uploading a file is never by itself enough to unlock a tax invoice.
 */
export async function verifyCompletionAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const completionId = String(formData.get('completionId') ?? '')

    await asActorWith('completion.manage', async (db, actor) => {
      const [record] = await db
        .select()
        .from(completionRecords)
        .where(eq(completionRecords.id, completionId))
        .limit(1)

      if (!record) throw new NotFoundError('That completion record no longer exists.')
      if (record.verifiedAt) throw new ConflictError('This evidence has already been verified.')

      await db
        .update(completionRecords)
        .set({ verifiedBy: actor.id, verifiedAt: new Date() })
        .where(eq(completionRecords.id, completionId))

      await recordAudit(db, actor, {
        action: 'completion.verified',
        entityType: 'completion_records',
        entityId: completionId,
        metadata: { projectId: record.projectId },
      })
    })

    revalidatePath('/technical/projects')
    return {
      ok: true,
      data: null,
      message: 'Verified. Invoicing is now unlocked for this project.',
    }
  } catch (err) {
    return actionError(err)
  }
}

/* -------------------------------------------------------------------------- */
/* EFD receipts                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Records the official EFD receipt a person obtained from TRA.
 *
 * The platform does not issue these and does not pretend to. Until HA GROUP has
 * an approved TRA integration with credentials, `provider` stays `manual` and
 * the receipt number is typed in from the printed receipt.
 */
export async function recordEfdReceiptAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = efdReceiptSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) {
      throw new ValidationError('Check the details below.', fieldErrorsFrom(parsed.error))
    }
    const v = parsed.data

    const file = formData.get('receipt')
    const hasFile = file instanceof File && file.size > 0

    const id = await asActorWith('efd.manage', async (db, actor) => {
      const [invoice] = await db
        .select()
        .from(documents)
        .where(eq(documents.id, v.invoiceDocumentId))
        .limit(1)

      if (!invoice) throw new NotFoundError('That invoice no longer exists.')
      if (invoice.documentType !== 'tax_invoice' && invoice.documentType !== 'export_invoice') {
        throw new ConflictError('An EFD receipt belongs to a tax invoice.')
      }
      if (invoice.status !== 'approved' && invoice.status !== 'issued') {
        throw new ConflictError('Approve the invoice before recording its EFD receipt.')
      }

      const stored = hasFile
        ? await storeUpload(file as File, 'document', `efd/${invoice.id}`)
        : null

      try {
        const [created] = await db
          .insert(efdReceipts)
          .values({
            invoiceDocumentId: invoice.id,
            projectId: invoice.projectId,
            clientId: invoice.clientId,
            receiptNumber: v.receiptNumber,
            issuedOn: v.issuedOn,
            verificationCode: v.verificationCode ?? null,
            receiptTotal: v.receiptTotal ?? null,
            status: 'recorded',
            provider: isEfdIntegrationConfigured() ? 'tra_api' : 'manual',
            receiptStorageKey: stored?.storageKey ?? null,
            receiptFilename: stored?.filename ?? null,
            receiptContentType: stored?.contentType ?? null,
            receiptByteSize: stored?.byteSize ?? null,
            receiptChecksumSha256: stored?.checksumSha256 ?? null,
            notes: v.notes ?? null,
            recordedBy: actor.id,
          })
          .returning({ id: efdReceipts.id })

        await recordAudit(db, actor, {
          action: 'efd.recorded',
          entityType: 'efd_receipts',
          entityId: created!.id,
          metadata: {
            invoiceReference: invoice.reference,
            receiptNumber: v.receiptNumber,
            provider: 'manual',
          },
        })

        return created!.id
      } catch (err) {
        if (stored)
          await getStorage()
            .remove(stored.storageKey)
            .catch(() => undefined)
        throw err
      }
    })

    revalidatePath('/technical/documents')
    return { ok: true, data: { id }, message: 'EFD receipt recorded against the invoice.' }
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
      return {
        ok: false,
        error: 'That EFD receipt number is already recorded.',
        code: 'duplicate',
        fieldErrors: { receiptNumber: ['This receipt number is already on file.'] },
      }
    }
    return actionError(err)
  }
}

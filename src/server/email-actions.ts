'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { documentVersions, documents, emailAttachments, emailMessages } from '@/db/schema'
import { recordAudit } from '@/lib/audit'
import { asActorWith } from '@/lib/authz/guard'
import {
  actionError,
  ConflictError,
  NotFoundError,
  ValidationError,
  type ActionResult,
} from '@/lib/errors'
import { getEmailProvider } from '@/lib/email'
import { getStorage } from '@/lib/storage'
import { fieldErrorsFrom, sendDocumentSchema } from '@/lib/validation/document-schemas'

/**
 * Sending an approved document to a client — Stage 7.
 *
 * The message is written to `email_messages` BEFORE any attempt to send, so the
 * log is a record of intent as well as outcome. A failed send leaves a row
 * marked `failed` with the reason, rather than vanishing.
 *
 * Only an approved or issued document can be sent. A draft leaving the building
 * is exactly what the approval workflow exists to prevent.
 */
export async function sendDocumentEmailAction(
  _prev: ActionResult<{ status: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ status: string }>> {
  try {
    const parsed = sendDocumentSchema.safeParse({
      documentId: formData.get('documentId'),
      to: formData.get('to'),
      cc: formData.get('cc') ?? '',
      subject: formData.get('subject'),
      body: formData.get('body'),
    })
    if (!parsed.success) {
      throw new ValidationError('Check the details below.', fieldErrorsFrom(parsed.error))
    }
    const v = parsed.data

    const outcome = await asActorWith('document.send', async (db, actor) => {
      const [doc] = await db.select().from(documents).where(eq(documents.id, v.documentId)).limit(1)

      if (!doc) throw new NotFoundError('That document no longer exists.')

      if (doc.status !== 'approved' && doc.status !== 'issued') {
        throw new ConflictError(
          'Only an approved document can be sent to a client. This one is still ' +
            doc.status.replace(/_/g, ' ') +
            '.',
        )
      }

      const [version] = await db
        .select()
        .from(documentVersions)
        .where(
          and(
            eq(documentVersions.documentId, doc.id),
            eq(documentVersions.isApprovedVersion, true),
          ),
        )
        .limit(1)

      if (!version) throw new ConflictError('This document has no approved version to send.')

      // The sealed rendering is what goes out when one exists.
      const key = version.signedPdfStorageKey ?? version.pdfStorageKey
      if (!key) {
        throw new ConflictError('The approved document has not been rendered yet.')
      }

      const [message] = await db
        .insert(emailMessages)
        .values({
          toAddresses: v.to,
          ccAddresses: v.cc.length > 0 ? v.cc : null,
          subject: v.subject,
          bodyText: v.body,
          documentId: doc.id,
          clientId: doc.clientId,
          status: 'queued',
          provider: getEmailProvider().name,
          queuedBy: actor.id,
        })
        .returning({ id: emailMessages.id })

      const messageId = message!.id

      const pdf = await getStorage().get(key)
      const filename = doc.filename ?? `${doc.reference ?? 'document'}.pdf`

      await db.insert(emailAttachments).values({
        emailMessageId: messageId,
        documentVersionId: version.id,
        storageKey: key,
        filename,
        contentType: 'application/pdf',
        byteSize: pdf.byteLength,
      })

      const provider = getEmailProvider()

      if (!provider.isConfigured()) {
        await db
          .update(emailMessages)
          .set({
            status: 'failed',
            failureReason:
              'No email provider is configured. The message is saved and can be retried once ' +
              'RESEND_API_KEY and EMAIL_FROM are set.',
            attemptCount: 1,
            lastAttemptAt: new Date(),
          })
          .where(eq(emailMessages.id, messageId))

        await recordAudit(db, actor, {
          action: 'document.emailed',
          entityType: 'documents',
          entityId: doc.id,
          metadata: { messageId, outcome: 'not_configured', recipients: v.to.length },
        })

        return { status: 'not_configured', messageId }
      }

      try {
        const result = await provider.send({
          to: v.to,
          cc: v.cc,
          subject: v.subject,
          text: v.body,
          attachments: [{ filename, content: pdf, contentType: 'application/pdf' }],
        })

        await db
          .update(emailMessages)
          .set({
            status: 'sent',
            providerMessageId: result.providerMessageId,
            sentAt: new Date(),
            attemptCount: 1,
            lastAttemptAt: new Date(),
          })
          .where(eq(emailMessages.id, messageId))

        await recordAudit(db, actor, {
          action: 'document.emailed',
          entityType: 'documents',
          entityId: doc.id,
          metadata: {
            messageId,
            outcome: 'sent',
            recipients: v.to.length,
            reference: doc.reference,
          },
        })

        return { status: 'sent', messageId }
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Unknown sending failure.'

        await db
          .update(emailMessages)
          .set({
            status: 'failed',
            failureReason: reason.slice(0, 1000),
            attemptCount: 1,
            lastAttemptAt: new Date(),
          })
          .where(eq(emailMessages.id, messageId))

        await recordAudit(db, actor, {
          action: 'document.emailed',
          entityType: 'documents',
          entityId: doc.id,
          metadata: { messageId, outcome: 'failed' },
        })

        // Not rethrown: the record of the attempt must survive, and the caller
        // gets a clear message rather than a rolled-back transaction.
        return { status: 'failed', messageId, reason }
      }
    })

    revalidatePath(`/technical/documents/${parsed.data.documentId}`)

    if (outcome.status === 'sent') {
      return {
        ok: true,
        data: { status: 'sent' },
        message: 'Sent, and logged against the document.',
      }
    }
    if (outcome.status === 'not_configured') {
      return {
        ok: false,
        error:
          'Email is not configured yet, so nothing was sent. The message has been saved and can be ' +
          'retried once an Administrator sets the mail credentials.',
        code: 'email_unconfigured',
      }
    }
    return {
      ok: false,
      error: `The message could not be sent. ${'reason' in outcome ? outcome.reason : ''}`.trim(),
      code: 'email_failed',
    }
  } catch (err) {
    return actionError(err)
  }
}

export async function retryEmailAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const messageId = String(formData.get('messageId') ?? '')

    await asActorWith('document.send', async (db, actor) => {
      const [message] = await db
        .select()
        .from(emailMessages)
        .where(eq(emailMessages.id, messageId))
        .limit(1)

      if (!message) throw new NotFoundError('That message no longer exists.')
      if (message.status === 'sent') throw new ConflictError('That message was already sent.')

      const provider = getEmailProvider()
      if (!provider.isConfigured()) {
        throw new ConflictError(
          'Email is still not configured. Set the mail credentials before retrying.',
        )
      }

      const attachments = await db
        .select()
        .from(emailAttachments)
        .where(eq(emailAttachments.emailMessageId, messageId))

      const loaded = await Promise.all(
        attachments.map(async (a) => ({
          filename: a.filename,
          content: await getStorage().get(a.storageKey),
          contentType: a.contentType,
        })),
      )

      const result = await provider.send({
        to: message.toAddresses,
        cc: message.ccAddresses ?? [],
        subject: message.subject,
        text: message.bodyText,
        attachments: loaded,
      })

      await db
        .update(emailMessages)
        .set({
          status: 'sent',
          providerMessageId: result.providerMessageId,
          sentAt: new Date(),
          failureReason: null,
          attemptCount: message.attemptCount + 1,
          lastAttemptAt: new Date(),
        })
        .where(eq(emailMessages.id, messageId))

      await recordAudit(db, actor, {
        action: 'document.emailed',
        entityType: 'email_messages',
        entityId: messageId,
        metadata: { outcome: 'sent_on_retry', attempt: message.attemptCount + 1 },
      })
    })

    revalidatePath('/technical/documents')
    return { ok: true, data: null, message: 'Sent.' }
  } catch (err) {
    return actionError(err)
  }
}

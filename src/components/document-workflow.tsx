'use client'

import { useActionState, useState } from 'react'
import { CheckCircle2, Eye, Mail, Receipt, Send, XCircle } from 'lucide-react'
import { Field, Input, Notice, Panel, PanelHeader, Select, Textarea } from '@/components/ui'
import { errorsFor, FormResult, SubmitButton } from '@/components/form'
import {
  cancelDocumentAction,
  createInvoiceFromQuotationAction,
  submitDocumentForApprovalAction,
} from '@/server/document-actions'
import { issueDocumentAction, previewDocumentAction } from '@/server/approval-actions'
import { sendDocumentEmailAction } from '@/server/email-actions'
import { checkDocumentCompletenessAction } from '@/server/ai-actions'
import { recordEfdReceiptAction } from '@/server/operations-actions'

/**
 * What a Technical Officer can do with a document, given where it is.
 *
 * Only actions that are legal from the current status are shown. The database
 * enforces the same transitions, so this is about not offering a dead end
 * rather than about security.
 */
export function DocumentWorkflow({
  documentId,
  documentType,
  status,
  reference,
  linkedPoNumber,
  purchaseOrders,
  hasApprovedVersion,
  canSubmit,
  canSend,
  canIssue,
}: {
  documentId: string
  documentType: string
  status: string
  reference: string | null
  linkedPoNumber: string | null
  purchaseOrders: Array<{ id: string; poNumber: string; status: string }>
  hasApprovedVersion: boolean
  canSubmit: boolean
  canSend: boolean
  canIssue: boolean
}) {
  const [submitState, submitAction] = useActionState(submitDocumentForApprovalAction, null)
  const [previewState, previewAction] = useActionState(previewDocumentAction, null)
  const [checkState, checkAction] = useActionState(checkDocumentCompletenessAction, null)
  const [invoiceState, invoiceAction] = useActionState(createInvoiceFromQuotationAction, null)
  const [issueState, issueAction] = useActionState(issueDocumentAction, null)
  const [emailState, emailAction] = useActionState(sendDocumentEmailAction, null)
  const [efdState, efdAction] = useActionState(recordEfdReceiptAction, null)
  const [cancelState, cancelAction] = useActionState(cancelDocumentAction, null)

  const [panel, setPanel] = useState<'none' | 'email' | 'efd' | 'invoice' | 'cancel'>('none')

  const editable = status === 'draft' || status === 'changes_requested'
  const approved = status === 'approved' || status === 'issued'
  const closed = status === 'cancelled' || status === 'archived'

  const check = checkState?.ok ? checkState.data : null

  return (
    <Panel>
      <PanelHeader
        title="What happens next"
        description={
          closed
            ? 'This document is closed.'
            : approved
              ? 'Approved. It can be issued and sent to the client.'
              : 'Prepare the document, then send it for approval.'
        }
      />

      <div className="space-y-4 p-4 sm:p-5">
        <FormResult state={submitState} />
        <FormResult state={previewState} />
        <FormResult state={invoiceState} />
        <FormResult state={issueState} />
        <FormResult state={emailState} />
        <FormResult state={efdState} />
        <FormResult state={cancelState} />

        {/* ---------------- Readiness check ---------------- */}
        {editable ? (
          <div className="space-y-2">
            <form action={checkAction}>
              <input type="hidden" name="documentId" value={documentId} />
              <SubmitButton variant="secondary" size="sm" pendingLabel="Checking…">
                Check what is missing
              </SubmitButton>
            </form>

            {check ? (
              <div className="space-y-2">
                {check.blocking.length > 0 ? (
                  <Notice tone="risk" title="These must be resolved before submitting">
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                      {check.blocking.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  </Notice>
                ) : (
                  <Notice tone="ok">Nothing is blocking submission.</Notice>
                )}

                {check.advisory.length > 0 ? (
                  <Notice tone="warn" title="Worth checking">
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                      {check.advisory.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </Notice>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* ---------------- Preview and submit ---------------- */}
        {editable ? (
          <div className="flex flex-col gap-2 border-t border-ink-100 pt-4 sm:flex-row-reverse">
            {canSubmit ? (
              <form action={submitAction} className="sm:order-2">
                <input type="hidden" name="documentId" value={documentId} />
                <SubmitButton size="lg" pendingLabel="Submitting…">
                  <Send className="size-4" aria-hidden="true" />
                  Send for approval
                </SubmitButton>
              </form>
            ) : null}

            <form action={previewAction} className="sm:order-1">
              <input type="hidden" name="documentId" value={documentId} />
              <SubmitButton variant="secondary" size="lg" pendingLabel="Rendering…">
                <Eye className="size-4" aria-hidden="true" />
                Render a preview
              </SubmitButton>
            </form>
          </div>
        ) : null}

        {previewState?.ok ? (
          <div className="flex flex-wrap gap-3 text-sm">
            <a
              href={`/api/documents/${documentId}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-brand-700 hover:underline"
            >
              Open the preview PDF
            </a>
            <a
              href={`/api/documents/${documentId}/docx`}
              className="font-medium text-brand-700 hover:underline"
            >
              Download the DOCX
            </a>
          </div>
        ) : null}

        {status === 'pending_approval' ? (
          <Notice tone="warn">
            Waiting for the Director. You cannot change the document while it is with them — if
            something is wrong, ask them to request a correction.
          </Notice>
        ) : null}

        {/* ---------------- Approved actions ---------------- */}
        {approved ? (
          <div className="space-y-3 border-t border-ink-100 pt-4">
            <div className="flex flex-wrap gap-2">
              {hasApprovedVersion ? (
                <a
                  href={`/api/documents/${documentId}/signed`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tap inline-flex items-center gap-2 rounded border border-ink-300 bg-white px-4 text-sm font-medium text-ink-800 hover:bg-ink-50"
                >
                  <Eye className="size-4" aria-hidden="true" />
                  Open final document
                </a>
              ) : null}

              {canSend ? (
                <button
                  type="button"
                  onClick={() => setPanel(panel === 'email' ? 'none' : 'email')}
                  className="tap inline-flex items-center gap-2 rounded bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
                >
                  <Mail className="size-4" aria-hidden="true" />
                  Send to client
                </button>
              ) : null}

              {canIssue && status === 'approved' ? (
                <form action={issueAction}>
                  <input type="hidden" name="documentId" value={documentId} />
                  <SubmitButton variant="secondary" pendingLabel="Marking…">
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                    Mark as issued
                  </SubmitButton>
                </form>
              ) : null}

              {documentType === 'quotation' ? (
                <button
                  type="button"
                  onClick={() => setPanel(panel === 'invoice' ? 'none' : 'invoice')}
                  className="tap inline-flex items-center gap-2 rounded border border-ink-300 bg-white px-4 text-sm font-medium text-ink-800 hover:bg-ink-50"
                >
                  Raise the invoice
                </button>
              ) : null}

              {documentType === 'tax_invoice' ? (
                <button
                  type="button"
                  onClick={() => setPanel(panel === 'efd' ? 'none' : 'efd')}
                  className="tap inline-flex items-center gap-2 rounded border border-ink-300 bg-white px-4 text-sm font-medium text-ink-800 hover:bg-ink-50"
                >
                  <Receipt className="size-4" aria-hidden="true" />
                  Record the EFD receipt
                </button>
              ) : null}
            </div>

            {/* ---- Raise invoice from quotation ---- */}
            {panel === 'invoice' ? (
              <form
                action={invoiceAction}
                className="space-y-3 rounded border border-ink-200 bg-ink-50 p-3"
              >
                <input type="hidden" name="quotationId" value={documentId} />

                {purchaseOrders.length === 0 ? (
                  <Notice tone="warn">
                    No client Purchase Order has been recorded for this project. The client issues
                    the PO — record it under the project first. The platform never generates one.
                  </Notice>
                ) : (
                  <>
                    <Field
                      label="Client Purchase Order"
                      htmlFor="clientPurchaseOrderId"
                      hint="The number the client issued. Required on a tax invoice."
                      required
                      errors={errorsFor(invoiceState, 'clientPurchaseOrderId')}
                    >
                      <Select id="clientPurchaseOrderId" name="clientPurchaseOrderId" required>
                        <option value="">Choose the Purchase Order…</option>
                        {purchaseOrders.map((po) => (
                          <option key={po.id} value={po.id}>
                            {po.poNumber}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <p className="text-xs text-ink-500">
                      The quotation’s pre-VAT charges are folded into the unit prices, which is how
                      HA GROUP’s own invoices are built. Any rounding difference is reported before
                      you submit.
                    </p>
                    <SubmitButton pendingLabel="Drafting…">Draft the invoice</SubmitButton>
                  </>
                )}
              </form>
            ) : null}

            {/* ---- Email ---- */}
            {panel === 'email' ? (
              <form
                action={emailAction}
                className="space-y-3 rounded border border-ink-200 bg-ink-50 p-3"
              >
                <input type="hidden" name="documentId" value={documentId} />
                <Field
                  label="To"
                  htmlFor="to"
                  hint="Separate several addresses with commas."
                  required
                  errors={errorsFor(emailState, 'to')}
                >
                  <Input id="to" name="to" required placeholder="name@client.co.tz" />
                </Field>
                <Field label="Cc" htmlFor="cc" errors={errorsFor(emailState, 'cc')}>
                  <Input id="cc" name="cc" />
                </Field>
                <Field
                  label="Subject"
                  htmlFor="subject"
                  required
                  errors={errorsFor(emailState, 'subject')}
                >
                  <Input
                    id="subject"
                    name="subject"
                    defaultValue={reference ? `${reference} — HA GROUP TZ LTD` : ''}
                    required
                  />
                </Field>
                <Field label="Message" htmlFor="body" required errors={errorsFor(emailState, 'body')}>
                  <Textarea
                    id="body"
                    name="body"
                    rows={5}
                    required
                    defaultValue={
                      'Dear Sir/Madam,\n\nPlease find attached our document for your attention.\n\nWe thank you for trusting us with your business.\n\nYours Sincerely\nHA GROUP TZ LTD'
                    }
                  />
                </Field>
                <SubmitButton pendingLabel="Sending…">
                  <Mail className="size-4" aria-hidden="true" />
                  Send with the approved PDF attached
                </SubmitButton>
              </form>
            ) : null}

            {/* ---- EFD receipt ---- */}
            {panel === 'efd' ? (
              <form
                action={efdAction}
                className="space-y-3 rounded border border-ink-200 bg-ink-50 p-3"
              >
                <input type="hidden" name="invoiceDocumentId" value={documentId} />

                <Notice tone="neutral">
                  This platform does not issue TRA receipts and does not pretend to. Obtain the
                  receipt from your certified fiscal device, then record it here.
                </Notice>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Receipt number"
                    htmlFor="receiptNumber"
                    hint="Exactly as printed on the EFD receipt."
                    required
                    errors={errorsFor(efdState, 'receiptNumber')}
                  >
                    <Input id="receiptNumber" name="receiptNumber" required className="font-mono" />
                  </Field>
                  <Field
                    label="Issue date"
                    htmlFor="issuedOn"
                    required
                    errors={errorsFor(efdState, 'issuedOn')}
                  >
                    <Input id="issuedOn" name="issuedOn" type="date" required />
                  </Field>
                  <Field label="Verification code" htmlFor="verificationCode">
                    <Input id="verificationCode" name="verificationCode" className="font-mono" />
                  </Field>
                  <Field label="Receipt total" htmlFor="receiptTotal">
                    <Input id="receiptTotal" name="receiptTotal" inputMode="decimal" className="tabular" />
                  </Field>
                </div>

                <Field label="Receipt file" htmlFor="receipt" hint="A scan or PDF of the receipt.">
                  <input
                    id="receipt"
                    name="receipt"
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    className="tap w-full rounded border border-ink-300 bg-white px-3 text-sm"
                  />
                </Field>

                <SubmitButton pendingLabel="Recording…">Record the receipt</SubmitButton>
              </form>
            ) : null}
          </div>
        ) : null}

        {/* ---------------- Cancel ---------------- */}
        {!closed && !approved ? (
          <div className="border-t border-ink-100 pt-4">
            <button
              type="button"
              onClick={() => setPanel(panel === 'cancel' ? 'none' : 'cancel')}
              className="flex items-center gap-2 text-sm text-risk-600 hover:text-risk-700"
            >
              <XCircle className="size-4" aria-hidden="true" />
              Cancel this document
            </button>

            {panel === 'cancel' ? (
              <form action={cancelAction} className="mt-3 space-y-3">
                <input type="hidden" name="documentId" value={documentId} />
                <Field
                  label="Reason"
                  htmlFor="cancel-reason"
                  required
                  errors={errorsFor(cancelState, 'reason')}
                >
                  <Textarea id="cancel-reason" name="reason" rows={2} required minLength={5} />
                </Field>
                <SubmitButton variant="danger" pendingLabel="Cancelling…">
                  Cancel document
                </SubmitButton>
              </form>
            ) : null}
          </div>
        ) : null}

        {linkedPoNumber ? (
          <p className="border-t border-ink-100 pt-3 text-xs text-ink-500">
            Raised against client Purchase Order{' '}
            <span className="font-mono text-ink-700">{linkedPoNumber}</span>, issued by the client.
          </p>
        ) : null}
      </div>
    </Panel>
  )
}

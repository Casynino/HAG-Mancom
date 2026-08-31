'use client'

import { useActionState, useState } from 'react'
import { Check, CornerUpLeft, PenLine, Stamp, X } from 'lucide-react'
import { Field, Notice, Panel, PanelHeader, Textarea } from '@/components/ui'
import { errorsFor, FormResult, SubmitButton } from '@/components/form'
import { decideDocumentAction } from '@/server/approval-actions'

/**
 * The Director's decision, built for a phone.
 *
 * Approve is one tap when nothing needs sealing. Reject and request-correction
 * both open a comment box, because sending a document back without saying why
 * wastes the Technical Office's time.
 *
 * The signature and stamp switches only appear to someone who may actually
 * apply them. That is a courtesy — the real enforcement is a database trigger
 * that refuses the insert, so a Technical Officer cannot seal a document even
 * if they reach this component.
 */
export function ApprovalDecision({
  documentId,
  requiresSignature,
  requiresStamp,
  maySign,
  mayStamp,
  hasOwnSignature,
  hasStamp,
  compact,
}: {
  documentId: string
  requiresSignature: boolean
  requiresStamp: boolean
  maySign: boolean
  mayStamp: boolean
  hasOwnSignature: boolean
  hasStamp: boolean
  /**
   * Drop the surrounding panel and heading so the same control can sit inside a
   * card in the approval queue. A Director should be able to clear a queue of
   * three straightforward letters without opening three pages — and it is the
   * same component, so the signature and stamp rules cannot drift between the
   * two places it appears.
   */
  compact?: boolean
}) {
  const [state, formAction] = useActionState(decideDocumentAction, null)
  const [mode, setMode] = useState<'none' | 'reject' | 'changes'>('none')

  const signatureBlocked = requiresSignature && (!maySign || !hasOwnSignature)
  const stampBlocked = requiresStamp && (!mayStamp || !hasStamp)

  const body = (
    <>
      <div className={compact ? 'space-y-3' : 'space-y-4 p-4 sm:p-5'}>
        <FormResult state={state} />

        {signatureBlocked ? (
          <Notice tone="risk" title="This document type needs a signature">
            {!maySign
              ? 'Only a Director may apply a signature. This document must go to a Director.'
              : 'You have no approved signature on file. An Administrator must upload and approve your signature image before you can sign documents.'}
          </Notice>
        ) : null}

        {stampBlocked ? (
          <Notice tone="risk" title="This document type needs the company stamp">
            {!mayStamp
              ? 'Only a Director or Administrator may apply the company stamp.'
              : 'No approved company stamp is on file. An Administrator must upload and approve one.'}
          </Notice>
        ) : null}

        {/* ---------------- Approve ---------------- */}
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="documentId" value={documentId} />
          <input type="hidden" name="decision" value="approve" />

          {maySign || mayStamp ? (
            <div className="space-y-2">
              {maySign ? (
                <label className="tap-lg flex cursor-pointer items-center gap-3 rounded border border-ink-200 px-4 has-checked:border-brand-600 has-checked:bg-brand-50 has-disabled:opacity-50">
                  <input
                    type="checkbox"
                    name="applySignature"
                    defaultChecked={requiresSignature && hasOwnSignature}
                    disabled={!hasOwnSignature}
                    className="size-4 accent-brand-600"
                  />
                  <PenLine className="size-4 text-ink-500" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink-900">
                      Apply my signature
                      {requiresSignature ? ' (required for this document type)' : ''}
                    </span>
                    <span className="block text-xs text-ink-500">
                      {hasOwnSignature
                        ? 'Your own approved signature. It cannot be applied by anyone else.'
                        : 'No approved signature on file for you.'}
                    </span>
                  </span>
                </label>
              ) : null}

              {mayStamp ? (
                <label className="tap-lg flex cursor-pointer items-center gap-3 rounded border border-ink-200 px-4 has-checked:border-brand-600 has-checked:bg-brand-50 has-disabled:opacity-50">
                  <input
                    type="checkbox"
                    name="applyStamp"
                    defaultChecked={requiresStamp && hasStamp}
                    disabled={!hasStamp}
                    className="size-4 accent-brand-600"
                  />
                  <Stamp className="size-4 text-ink-500" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink-900">
                      Apply the company stamp
                      {requiresStamp ? ' (required for this document type)' : ''}
                    </span>
                    <span className="block text-xs text-ink-500">
                      {hasStamp ? 'The approved company stamp.' : 'No approved stamp on file.'}
                    </span>
                  </span>
                </label>
              ) : null}
            </div>
          ) : null}

          <Field label="Comment" htmlFor="approve-comment" errors={errorsFor(state, 'comment')}>
            <Textarea
              id="approve-comment"
              name="comment"
              rows={2}
              maxLength={4000}
              placeholder="Optional — recorded against the approval."
            />
          </Field>

          <SubmitButton
            size="lg"
            pendingLabel="Approving…"
            className="w-full"
            disabled={signatureBlocked || stampBlocked}
          >
            <Check className="size-5" aria-hidden="true" />
            Approve
          </SubmitButton>
        </form>

        {/* ---------------- Send back ---------------- */}
        <div className="grid grid-cols-2 gap-2 border-t border-ink-100 pt-4">
          <button
            type="button"
            onClick={() => setMode(mode === 'changes' ? 'none' : 'changes')}
            className="tap-lg flex items-center justify-center gap-2 rounded border border-ink-300 bg-panel px-3 text-sm font-medium text-ink-800 hover:bg-ink-50"
          >
            <CornerUpLeft className="size-4" aria-hidden="true" />
            Request a correction
          </button>
          <button
            type="button"
            onClick={() => setMode(mode === 'reject' ? 'none' : 'reject')}
            className="tap-lg flex items-center justify-center gap-2 rounded border border-risk-600/30 bg-panel px-3 text-sm font-medium text-risk-700 hover:bg-risk-50"
          >
            <X className="size-4" aria-hidden="true" />
            Reject
          </button>
        </div>

        {mode !== 'none' ? (
          <form
            action={formAction}
            className={`space-y-3 rounded border p-3 ${
              mode === 'reject' ? 'border-risk-600/25 bg-risk-50' : 'border-warn-600/25 bg-warn-50'
            }`}
          >
            <input type="hidden" name="documentId" value={documentId} />
            <input
              type="hidden"
              name="decision"
              value={mode === 'reject' ? 'reject' : 'request_changes'}
            />

            <Field
              label={mode === 'reject' ? 'Why are you rejecting this?' : 'What needs correcting?'}
              htmlFor="decision-comment"
              hint="This goes back to the Technical Office."
              required
              errors={errorsFor(state, 'comment')}
            >
              <Textarea id="decision-comment" name="comment" rows={3} required maxLength={4000} />
            </Field>

            <SubmitButton
              variant={mode === 'reject' ? 'danger' : 'primary'}
              pendingLabel="Sending…"
            >
              {mode === 'reject' ? 'Reject document' : 'Send back for correction'}
            </SubmitButton>
          </form>
        ) : null}

        {compact ? null : (
          <p className="text-xs text-ink-400">
            Approving preserves the unsigned version and creates a final, locked version with a
            content hash. Corrections after approval require a new revision.
          </p>
        )}
      </div>
    </>
  )

  if (compact) return body

  return (
    <Panel>
      <PanelHeader
        title="Your decision"
        description="Approving locks this version and generates the final document."
      />
      {body}
    </Panel>
  )
}

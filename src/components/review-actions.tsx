'use client'

import { useActionState, useState } from 'react'
import { Check, CornerUpLeft, FileCheck2, Link2, Play, XCircle } from 'lucide-react'
import { Field, Notice, Panel, PanelHeader, Select, Textarea } from '@/components/ui'
import { errorsFor, FormResult, SubmitButton } from '@/components/form'
import {
  acceptSubmissionAction,
  cancelSubmissionAction,
  markReadyAction,
  relinkSubmissionAction,
  requestChangesAction,
  saveReviewNotesAction,
  startReviewAction,
} from '@/server/review-actions'

/**
 * Technical Officer decisions.
 *
 * Only the actions that are legal from the current status are offered — the
 * database enforces the same transitions, so this is about not presenting a
 * dead end rather than about security.
 *
 * There are deliberately no quotation or invoice controls here. Those belong to
 * the Document Engine phase and would be buttons that do nothing.
 */

interface ProjectOption {
  id: string
  name: string
  reference: string
  clientName: string
}

export function ReviewActions({
  submissionId,
  status,
  currentProjectId,
  internalReviewNotes,
  projects,
  canRelink,
  canCancel,
}: {
  submissionId: string
  status: string
  currentProjectId: string
  internalReviewNotes: string
  projects: ProjectOption[]
  canRelink: boolean
  canCancel: boolean
}) {
  const [startState, startAction] = useActionState(startReviewAction, null)
  const [notesState, notesAction] = useActionState(saveReviewNotesAction, null)
  const [changesState, changesAction] = useActionState(requestChangesAction, null)
  const [acceptState, acceptAction] = useActionState(acceptSubmissionAction, null)
  const [readyState, readyAction] = useActionState(markReadyAction, null)
  const [relinkState, relinkAction] = useActionState(relinkSubmissionAction, null)
  const [cancelState, cancelAction] = useActionState(cancelSubmissionAction, null)

  const [panel, setPanel] = useState<'none' | 'changes' | 'relink' | 'cancel'>('none')

  const isOpen = status === 'submitted' || status === 'under_review'
  const isAccepted = status === 'accepted'
  const isClosed = status === 'cancelled' || status === 'ready_for_documentation'

  return (
    <Panel>
      <PanelHeader
        title="Your decision"
        description={
          isClosed
            ? 'This submission is closed.'
            : 'Internal notes stay in the Technical Office. Correction comments go to the Engineer.'
        }
      />

      <div className="space-y-4 p-4 sm:p-5">
        <FormResult state={startState} />
        <FormResult state={notesState} />
        <FormResult state={changesState} />
        <FormResult state={acceptState} />
        <FormResult state={readyState} />
        <FormResult state={relinkState} />
        <FormResult state={cancelState} />

        {status === 'submitted' ? (
          <form action={startAction}>
            <input type="hidden" name="submissionId" value={submissionId} />
            <SubmitButton size="lg" pendingLabel="Starting…">
              <Play className="size-4" aria-hidden="true" />
              Start review
            </SubmitButton>
          </form>
        ) : null}

        {/* -------- Internal notes -------- */}
        {!isClosed ? (
          <form action={notesAction} className="space-y-2">
            <input type="hidden" name="submissionId" value={submissionId} />
            <Field
              label="Internal review notes"
              htmlFor="internalReviewNotes"
              hint="Not shown to the Engineer."
              errors={errorsFor(notesState, 'internalReviewNotes')}
            >
              <Textarea
                id="internalReviewNotes"
                name="internalReviewNotes"
                defaultValue={internalReviewNotes}
                rows={3}
                maxLength={4000}
                placeholder="Pricing thoughts, parts to check, who to call…"
              />
            </Field>
            <SubmitButton variant="secondary" size="sm" pendingLabel="Saving…">
              Save notes
            </SubmitButton>
          </form>
        ) : null}

        {/* -------- Primary decisions -------- */}
        {isOpen ? (
          <div className="flex flex-col gap-2 border-t border-ink-100 pt-4 sm:flex-row">
            <form action={acceptAction} className="sm:order-2">
              <input type="hidden" name="submissionId" value={submissionId} />
              <SubmitButton size="lg" pendingLabel="Accepting…">
                <Check className="size-4" aria-hidden="true" />
                Accept
              </SubmitButton>
            </form>

            <button
              type="button"
              onClick={() => setPanel(panel === 'changes' ? 'none' : 'changes')}
              className="tap-lg flex items-center justify-center gap-2 rounded border border-ink-300 bg-white px-5 text-sm font-medium text-ink-800 hover:bg-ink-50 sm:order-1"
            >
              <CornerUpLeft className="size-4" aria-hidden="true" />
              Request a correction
            </button>
          </div>
        ) : null}

        {panel === 'changes' ? (
          <form action={changesAction} className="space-y-3 rounded border border-warn-600/25 bg-warn-50 p-3">
            <input type="hidden" name="submissionId" value={submissionId} />
            <Field
              label="What does the Engineer need to correct?"
              htmlFor="comment"
              hint="This is sent to them and shown on their submission."
              required
              errors={errorsFor(changesState, 'comment')}
            >
              <Textarea
                id="comment"
                name="comment"
                rows={3}
                minLength={10}
                maxLength={2000}
                required
                placeholder="Please add a photo of the motor nameplate and the bearing part numbers."
              />
            </Field>
            <SubmitButton pendingLabel="Sending…">Return to Engineer</SubmitButton>
          </form>
        ) : null}

        {isAccepted ? (
          <div className="border-t border-ink-100 pt-4">
            <form action={readyAction}>
              <input type="hidden" name="submissionId" value={submissionId} />
              <SubmitButton size="lg" pendingLabel="Marking…">
                <FileCheck2 className="size-4" aria-hidden="true" />
                Mark ready for document preparation
              </SubmitButton>
            </form>
            <p className="mt-2 text-xs text-ink-400">
              Quotation and invoice preparation arrives with the Document Engine. Marking this ready
              records that the information is complete enough to price.
            </p>
          </div>
        ) : null}

        {/* -------- Corrections to linkage -------- */}
        {canRelink && !isClosed ? (
          <div className="border-t border-ink-100 pt-4">
            <button
              type="button"
              onClick={() => setPanel(panel === 'relink' ? 'none' : 'relink')}
              className="flex items-center gap-2 text-sm text-ink-600 hover:text-ink-900"
            >
              <Link2 className="size-4" aria-hidden="true" />
              Correct the client or project
            </button>

            {panel === 'relink' ? (
              <form action={relinkAction} className="mt-3 space-y-3">
                <input type="hidden" name="submissionId" value={submissionId} />
                <Field
                  label="Correct project"
                  htmlFor="projectId"
                  required
                  errors={errorsFor(relinkState, 'projectId')}
                >
                  <Select id="projectId" name="projectId" defaultValue={currentProjectId} required>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.clientName} — {p.name} ({p.reference})
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="Why is this being changed?"
                  htmlFor="reason"
                  required
                  errors={errorsFor(relinkState, 'reason')}
                >
                  <Textarea id="reason" name="reason" rows={2} minLength={5} maxLength={500} required />
                </Field>
                <SubmitButton variant="secondary" pendingLabel="Saving…">
                  Correct the link
                </SubmitButton>
              </form>
            ) : null}
          </div>
        ) : null}

        {/* -------- Cancel -------- */}
        {canCancel && !isClosed ? (
          <div className="border-t border-ink-100 pt-4">
            <button
              type="button"
              onClick={() => setPanel(panel === 'cancel' ? 'none' : 'cancel')}
              className="flex items-center gap-2 text-sm text-risk-600 hover:text-risk-700"
            >
              <XCircle className="size-4" aria-hidden="true" />
              Cancel this submission
            </button>

            {panel === 'cancel' ? (
              <form action={cancelAction} className="mt-3 space-y-3">
                <input type="hidden" name="submissionId" value={submissionId} />
                <Notice tone="risk">
                  Cancelling is final. The record and its attachments are kept, but no further work
                  can be done on it.
                </Notice>
                <Field
                  label="Reason"
                  htmlFor="reason"
                  required
                  errors={errorsFor(cancelState, 'reason')}
                >
                  <Textarea
                    id="reason"
                    name="reason"
                    rows={2}
                    minLength={5}
                    maxLength={500}
                    required
                  />
                </Field>
                <SubmitButton variant="danger" pendingLabel="Cancelling…">
                  Cancel submission
                </SubmitButton>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>
    </Panel>
  )
}

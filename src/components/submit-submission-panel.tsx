'use client'

import { useActionState } from 'react'
import { Send } from 'lucide-react'
import { Notice, Panel, PanelHeader } from '@/components/ui'
import { FormResult, SubmitButton } from '@/components/form'
import { submitSubmissionAction } from '@/server/submission-actions'

/**
 * The point of no return.
 *
 * Once filed, the Engineer's content is locked by a database trigger, so the
 * panel says so plainly beforehand rather than letting someone discover it
 * afterwards.
 */
export function SubmitSubmissionPanel({
  submissionId,
  isResubmission,
  hasEvidence,
}: {
  submissionId: string
  isResubmission: boolean
  hasEvidence: boolean
}) {
  const [state, formAction] = useActionState(submitSubmissionAction, null)

  return (
    <Panel>
      <PanelHeader
        title={isResubmission ? 'Send the correction' : 'Send to the Technical Officer'}
        description={
          isResubmission
            ? 'Your changes go back for review.'
            : 'Once sent, you cannot change what you wrote unless a correction is requested.'
        }
      />
      <div className="space-y-3 p-4 sm:p-5">
        <FormResult state={state} />

        {!hasEvidence ? (
          <Notice tone="warn">
            Add at least one photo, file or measurement before submitting. Photographs are what the
            Technical Officer prices from.
          </Notice>
        ) : null}

        <form action={formAction}>
          <input type="hidden" name="submissionId" value={submissionId} />
          <SubmitButton
            size="lg"
            pendingLabel="Sending…"
            disabled={!hasEvidence}
            className="w-full sm:w-auto"
          >
            <Send className="size-4" aria-hidden="true" />
            {isResubmission ? 'Resubmit for review' : 'Submit for review'}
          </SubmitButton>
        </form>
      </div>
    </Panel>
  )
}

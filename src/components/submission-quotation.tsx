'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { ArrowRight, FileText } from 'lucide-react'
import { Notice, Panel, PanelHeader } from '@/components/ui'
import { FormResult, SubmitButton } from '@/components/form'
import { DOCUMENT_TYPE_LABELS } from '@/lib/display'
import { createQuotationFromSubmissionAction } from '@/server/document-actions'

/**
 * The bridge from a reviewed site visit to a priced quotation.
 *
 * This is the step that used to be missing: a submission could be accepted and
 * then went nowhere. The action carries the submission's client, project and
 * scope across; the Technical Officer prices it on the document itself.
 *
 * Once a document exists for this submission the button is replaced by a link
 * to it — drafting a second quotation from the same visit would be an accident,
 * not an intention.
 */
export function SubmissionQuotation({
  submissionId,
  status,
  existing,
  canCreate,
  configReady,
  configMissing,
}: {
  submissionId: string
  status: string
  existing: Array<{ id: string; reference: string | null; documentType: string; status: string }>
  canCreate: boolean
  configReady: boolean
  configMissing: string[]
}) {
  const [state, action] = useActionState(createQuotationFromSubmissionAction, null)

  const eligible = status === 'accepted' || status === 'ready_for_documentation'
  if (!canCreate || (!eligible && existing.length === 0)) return null

  return (
    <Panel>
      <PanelHeader
        title="Documents from this visit"
        description="A quotation carries the client, project and scope across from the submission."
      />

      <div className="space-y-3 p-4 sm:p-5">
        <FormResult state={state} />

        {existing.length > 0 ? (
          <ul className="divide-y divide-ink-100">
            {existing.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2.5">
                <FileText className="size-4 shrink-0 text-ink-400" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/technical/documents/${d.id}`}
                    className="text-sm font-medium text-brand-700 hover:underline"
                  >
                    {DOCUMENT_TYPE_LABELS[d.documentType] ?? d.documentType}
                  </Link>
                  <p className="font-mono text-xs text-ink-400 tabular">
                    {/* A reference is allocated at approval, not at creation. */}
                    {d.reference ?? <span className="font-sans">Not yet numbered</span>}
                    <span className="font-sans"> · {d.status.replace(/_/g, ' ')}</span>
                  </p>
                </div>
                <ArrowRight className="size-4 text-ink-300" aria-hidden="true" />
              </li>
            ))}
          </ul>
        ) : null}

        {eligible && existing.length === 0 ? (
          !configReady ? (
            <Notice tone="warn" title="A quotation cannot be produced yet">
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {configMissing.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
              <p className="mt-2">
                An Administrator resolves these in{' '}
                <Link href="/admin/settings" className="font-medium underline">
                  Company settings
                </Link>
                .
              </p>
            </Notice>
          ) : (
            <form action={action}>
              <input type="hidden" name="submissionId" value={submissionId} />
              <SubmitButton size="lg" pendingLabel="Drafting…">
                <FileText className="size-4" aria-hidden="true" />
                Draft a quotation
              </SubmitButton>
            </form>
          )
        ) : null}
      </div>
    </Panel>
  )
}

'use client'

import Link from 'next/link'
import { useActionState, useMemo, useState } from 'react'
import { ArrowRight, FileText, Sparkles } from 'lucide-react'
import { Field, Input, Notice, Panel, PanelHeader, Select, Textarea } from '@/components/ui'
import { errorsFor, FormResult, SubmitButton } from '@/components/form'
import { DOCUMENT_TYPE_LABELS } from '@/lib/display'
import { createDocumentAction } from '@/server/document-actions'

/**
 * The single front door for producing a document.
 *
 * Deliberately a two-step flow rather than one long form. Step one creates the
 * document and nothing else; step two — pricing, wording, the assistant — takes
 * place on the document itself, where the totals recompute as lines change and
 * where the approval controls live. Collapsing both into one screen would mean
 * either a form that cannot show live totals, or a screen that has to be
 * abandoned halfway.
 */

interface ProjectOption {
  id: string
  name: string
  reference: string
  clientName: string
}

// Produced by their own flow: a delivery note comes from a recorded delivery,
// an EFD receipt only from a certified fiscal device, and a PO record from the
// client's own order. Offering them here would be a control that cannot succeed.
const NOT_HAND_DRAFTED = new Set(['delivery_note', 'efd_receipt', 'purchase_order_record'])

const TYPE_HINT: Record<string, string> = {
  quotation: 'Priced work offered to a client. Start from a site visit where there is one.',
  tax_invoice: 'Needs a confirmed delivery or verified completion before it can be approved.',
  official_letter: 'Prose on the company letterhead. The assistant can draft the body.',
  payment_request: 'A request against work already invoiced.',
  site_report: 'A written record of a visit, for the client.',
  completion_certificate: 'Issued when work is finished and accepted.',
  compliance_document: 'A statutory or regulatory document.',
  export_invoice: 'Export terms and tax treatment differ from a domestic invoice.',
}

export function DocumentStudio({
  projects,
  purchaseOrders,
  submissions,
  aiAvailable,
  configReady,
  configMissing,
}: {
  projects: ProjectOption[]
  purchaseOrders: Array<{ id: string; projectId: string; poNumber: string }>
  submissions: Array<{ id: string; title: string; projectId: string; authorName: string }>
  aiAvailable: boolean
  configReady: boolean
  configMissing: string[]
}) {
  const [state, action] = useActionState(createDocumentAction, null)
  const [documentType, setDocumentType] = useState('quotation')
  const [projectId, setProjectId] = useState('')

  const projectPos = useMemo(
    () => purchaseOrders.filter((p) => p.projectId === projectId),
    [purchaseOrders, projectId],
  )
  const projectSubmissions = useMemo(
    () => submissions.filter((s) => s.projectId === projectId),
    [submissions, projectId],
  )

  const isLetter = documentType === 'official_letter'
  const created = state?.ok ? state.data : null

  if (!configReady) {
    return (
      <Notice tone="warn" title="Company settings must be approved before documents can be issued">
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
    )
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr] lg:items-start">
      <Panel>
        <PanelHeader title="What are we producing?" />

        <form action={action} className="space-y-5 p-4 sm:p-5" noValidate>
          <FormResult state={state} />

          {created ? (
            <Notice tone="ok" title="Draft created">
              <Link
                href={`/technical/documents/${created.id}`}
                className="inline-flex items-center gap-1.5 font-medium underline"
              >
                Open it to price and word it
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Notice>
          ) : null}

          <Field
            label="Document type"
            htmlFor="documentType"
            required
            hint={TYPE_HINT[documentType]}
            errors={errorsFor(state, 'documentType')}
          >
            <Select
              id="documentType"
              name="documentType"
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              required
            >
              {Object.entries(DOCUMENT_TYPE_LABELS)
                .filter(([v]) => !NOT_HAND_DRAFTED.has(v))
                .map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Project"
              htmlFor="projectId"
              required
              errors={errorsFor(state, 'projectId')}
            >
              <Select
                id="projectId"
                name="projectId"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                required
              >
                <option value="">Choose a project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.clientName} — {p.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="From a site visit"
              htmlFor="sourceSubmissionId"
              hint={
                projectId
                  ? projectSubmissions.length > 0
                    ? 'Carries the findings across.'
                    : 'No accepted visits on this project.'
                  : 'Choose a project first.'
              }
            >
              <Select
                id="sourceSubmissionId"
                name="sourceSubmissionId"
                disabled={projectSubmissions.length === 0}
                defaultValue=""
              >
                <option value="">Not from a site visit</option>
                {projectSubmissions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Title" htmlFor="title" required errors={errorsFor(state, 'title')}>
              <Input id="title" name="title" required minLength={3} maxLength={200} />
            </Field>

            <Field
              label="Client Purchase Order"
              htmlFor="clientPurchaseOrderId"
              hint={
                projectPos.length > 0
                  ? "The client's own number, as they issued it."
                  : 'None recorded against this project.'
              }
            >
              <Select
                id="clientPurchaseOrderId"
                name="clientPurchaseOrderId"
                disabled={projectPos.length === 0}
                defaultValue=""
              >
                <option value="">Not against a Purchase Order</option>
                {projectPos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.poNumber}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Currency" htmlFor="currency" required>
              <Select id="currency" name="currency" defaultValue="TZS">
                <option value="TZS">TZS</option>
                <option value="USD">USD</option>
              </Select>
            </Field>

            <Field label="Service period" htmlFor="servicePeriodLabel" hint="e.g. JUNE 2026">
              <Input id="servicePeriodLabel" name="servicePeriodLabel" maxLength={120} />
            </Field>
          </div>

          <Field
            label="Scope"
            htmlFor="scopeDescription"
            hint="Printed above the priced lines. The assistant can expand this on the document."
          >
            <Textarea id="scopeDescription" name="scopeDescription" rows={3} maxLength={2000} />
          </Field>

          {isLetter ? (
            <Field
              label="Letter body"
              htmlFor="bodyContent"
              hint="Or leave blank and let the assistant draft it."
            >
              <Textarea id="bodyContent" name="bodyContent" rows={6} maxLength={20000} />
            </Field>
          ) : null}

          <SubmitButton size="lg" pendingLabel="Creating…">
            <FileText className="size-4" aria-hidden="true" />
            Create the draft
          </SubmitButton>
        </form>
      </Panel>

      <div className="space-y-5">
        <Panel>
          <PanelHeader title="What happens next" />
          <ol className="divide-y divide-ink-100 px-4 sm:px-5">
            {[
              [
                'You create the draft',
                'No reference is allocated yet — an abandoned draft never burns a number in the sequence.',
              ],
              [
                'You price it, then submit',
                'Totals are computed on the server from approved rates, never typed. Submitting is what allocates the reference and captures the exact version the approver will decide on.',
              ],
              [
                'The assistant drafts wording',
                'Scope and letter prose. It is never shown a price and never returns a figure.',
              ],
              [
                'A Director approves',
                'The signature and stamp are applied, and the PDF and DOCX are rendered and stored against that version.',
              ],
              [
                'It becomes immutable',
                'A correction after approval is a new revision, never an edit.',
              ],
            ].map(([title, body], i) => (
              <li key={title} className="flex gap-4 py-3.5">
                <span className="font-display flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700 tabular">
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink-900">{title}</span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-ink-500">{body}</span>
                </span>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel>
          <PanelHeader title="The assistant" />
          <div className="space-y-3 p-4 sm:p-5">
            {aiAvailable ? (
              <p className="flex items-center gap-2 text-sm text-ok-700">
                <Sparkles className="size-4" aria-hidden="true" />
                Configured and available on the document.
              </p>
            ) : (
              <Notice tone="neutral">
                Not configured, so wording has to be written by hand. Everything else works
                normally. An Administrator sets ANTHROPIC_API_KEY to switch it on.
              </Notice>
            )}

            <p className="text-sm leading-relaxed text-ink-500">
              It drafts wording only. It is never given prices, never returns figures, never
              allocates a document number, never approves anything and never applies a signature or
              stamp. Those are enforced in the database rather than left to the prompt.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  )
}

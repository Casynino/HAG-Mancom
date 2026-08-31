'use client'

import { useActionState, useMemo, useState } from 'react'
import { FilePlus2 } from 'lucide-react'
import { Field, Input, Notice, Panel, PanelHeader, Select, Textarea } from '@/components/ui'
import { errorsFor, FormResult, SubmitButton } from '@/components/form'
import { DOCUMENT_TYPE_LABELS } from '@/lib/display'
import { createDocumentAction } from '@/server/document-actions'

/**
 * Starting a document that does not come from a site visit.
 *
 * Letters, standalone invoices, payment requests and certificates begin here.
 * Quotations normally start from an accepted submission instead, so the scope
 * carries across — but nothing prevents drafting one directly.
 *
 * Two things this form deliberately does not do. It never offers to generate a
 * client Purchase Order number: the client issues those, so the only option is
 * to attach one already recorded against the project. And it never allocates a
 * document reference — that happens at approval, so a draft that is abandoned
 * does not burn a number in HA GROUP's sequence.
 */

interface ProjectOption {
  id: string
  name: string
  reference: string
  clientName: string
}

interface PurchaseOrderOption {
  id: string
  projectId: string
  poNumber: string
}

// Types that are produced by their own flow rather than drafted by hand. A
// delivery note comes from a recorded delivery; an EFD receipt can only come
// from TRA. Offering them here would be a control that cannot succeed.
const NOT_HAND_DRAFTED = new Set(['delivery_note', 'efd_receipt', 'purchase_order_record'])

export function DocumentCreateForm({
  projects,
  purchaseOrders,
  currencies,
}: {
  projects: ProjectOption[]
  purchaseOrders: PurchaseOrderOption[]
  currencies: string[]
}) {
  const [state, action] = useActionState(createDocumentAction, null)
  const [open, setOpen] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [documentType, setDocumentType] = useState('quotation')

  const projectPos = useMemo(
    () => purchaseOrders.filter((p) => p.projectId === projectId),
    [purchaseOrders, projectId],
  )

  const isLetter = documentType === 'official_letter'

  return (
    <Panel>
      <PanelHeader
        title="Start a document"
        description="Letters, invoices and certificates. Quotations usually start from a site submission."
        action={
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="tap flex items-center gap-2 rounded bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
          >
            <FilePlus2 className="size-4" aria-hidden="true" />
            {open ? 'Close' : 'New document'}
          </button>
        }
      />

      {open ? (
        projects.length === 0 ? (
          <div className="p-4 sm:p-5">
            <Notice tone="warn">
              Create a project first — every document belongs to one, so the client, address and
              references can be filled in from it.
            </Notice>
          </div>
        ) : (
          <form action={action} className="space-y-4 p-4 sm:p-5" noValidate>
            <FormResult state={state} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Document type"
                htmlFor="documentType"
                required
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

              <Field label="Title" htmlFor="title" required errors={errorsFor(state, 'title')}>
                <Input id="title" name="title" required minLength={3} maxLength={200} />
              </Field>

              <Field label="Currency" htmlFor="currency" required errors={errorsFor(state, 'currency')}>
                <Select id="currency" name="currency" defaultValue="TZS" required>
                  {currencies.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Client Purchase Order"
                htmlFor="clientPurchaseOrderId"
                hint={
                  projectId
                    ? projectPos.length > 0
                      ? "The client's own PO number, recorded against this project."
                      : 'None recorded against this project yet.'
                    : 'Choose a project first.'
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

              <Field
                label="Your reference"
                htmlFor="clientReference"
                hint="Anything the client asked you to quote back."
              >
                <Input id="clientReference" name="clientReference" maxLength={120} />
              </Field>

              <Field
                label="Document date"
                htmlFor="documentDate"
                hint="Leave blank for today."
                errors={errorsFor(state, 'documentDate')}
              >
                <Input id="documentDate" name="documentDate" type="date" />
              </Field>

              <Field
                label="Service period"
                htmlFor="servicePeriodLabel"
                hint="e.g. January 2026, or a date range."
              >
                <Input id="servicePeriodLabel" name="servicePeriodLabel" maxLength={120} />
              </Field>
            </div>

            <Field
              label="Scope"
              htmlFor="scopeDescription"
              hint="Printed above the priced lines."
              errors={errorsFor(state, 'scopeDescription')}
            >
              <Textarea id="scopeDescription" name="scopeDescription" rows={3} maxLength={2000} />
            </Field>

            {isLetter ? (
              <Field
                label="Letter body"
                htmlFor="bodyContent"
                hint="The letter itself. You can rewrite it, or ask the assistant to draft it, before approval."
                errors={errorsFor(state, 'bodyContent')}
              >
                <Textarea id="bodyContent" name="bodyContent" rows={8} maxLength={20000} />
              </Field>
            ) : null}

            <p className="text-xs text-ink-500">
              The document number is allocated when it is approved, not now.
            </p>

            <SubmitButton pendingLabel="Creating…">Create draft</SubmitButton>
          </form>
        )
      ) : null}
    </Panel>
  )
}

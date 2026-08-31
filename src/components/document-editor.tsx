'use client'

import { useActionState, useMemo, useState } from 'react'
import { FileText, PenLine, Plus, Sparkles, Trash2 } from 'lucide-react'
import { Badge, Field, Input, Notice, Panel, PanelHeader, Select, Textarea } from '@/components/ui'
import { errorsFor, FormResult, SubmitButton } from '@/components/form'
import { Decimal, formatAmount } from '@/lib/finance/decimal'
import { saveDocumentAction } from '@/server/document-actions'
import { draftLetterAction, draftScopeFromSubmissionAction } from '@/server/ai-actions'

/**
 * The document editor.
 *
 * The running totals shown here are a PREVIEW, computed with the same Decimal
 * arithmetic the server uses, so the figures agree — but they are never sent
 * back. Saving recomputes everything server-side from approved configuration,
 * and the server's answer is the one that reaches the document. A user cannot
 * submit a total.
 *
 * Line totals are not editable, deliberately. Phase 0 found a TZS 2.2m error in
 * a real quotation where the printed extension did not match quantity × rate;
 * removing the field removes that class of error.
 */

export interface LineDraft {
  kind: string
  description: string
  itemCode: string
  quantity: string
  unit: string
  unitPrice: string
  discountPercent: string
}

export interface ChargePreview {
  label: string
  ratePercent: string
  appliesBeforeVat: boolean
}

const LINE_KINDS = [
  { value: 'service', label: 'Service' },
  { value: 'material', label: 'Material' },
  { value: 'labour', label: 'Labour' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'transport', label: 'Transport' },
  { value: 'other', label: 'Other' },
]

function emptyLine(): LineDraft {
  return {
    kind: 'service',
    description: '',
    itemCode: '',
    quantity: '1',
    unit: '',
    unitPrice: '',
    discountPercent: '',
  }
}

/** Mirrors the server ladder for preview only. Never submitted. */
function previewTotals(
  lines: LineDraft[],
  charges: ChargePreview[],
  taxRatePercent: string | null,
  decimalPlaces: number,
) {
  const safe = (v: string) => {
    try {
      return Decimal.from(v.trim() === '' ? '0' : v.trim())
    } catch {
      return Decimal.ZERO
    }
  }

  let subTotal = Decimal.ZERO
  const lineTotals: string[] = []

  for (const line of lines) {
    const gross = safe(line.quantity).multiply(safe(line.unitPrice))
    const discount = line.discountPercent.trim()
      ? gross.percentOf(safe(line.discountPercent))
      : Decimal.ZERO
    const net = gross.subtract(discount).round(decimalPlaces, 'half_up')
    lineTotals.push(net.toFixed(decimalPlaces))
    subTotal = subTotal.add(net)
  }

  const chargeAmounts = charges.map((c) => ({
    ...c,
    amount: subTotal.percentOf(safe(c.ratePercent)).round(decimalPlaces, 'half_up'),
  }))

  const beforeVat = chargeAmounts
    .filter((c) => c.appliesBeforeVat)
    .reduce((acc, c) => acc.add(c.amount), Decimal.ZERO)
  const afterVat = chargeAmounts
    .filter((c) => !c.appliesBeforeVat)
    .reduce((acc, c) => acc.add(c.amount), Decimal.ZERO)

  const taxable = subTotal.add(beforeVat)
  const tax = taxRatePercent
    ? taxable.percentOf(safe(taxRatePercent)).round(decimalPlaces, 'half_up')
    : Decimal.ZERO
  const grand = taxable.add(tax).add(afterVat).round(decimalPlaces, 'half_up')

  return {
    lineTotals,
    subTotal: subTotal.toFixed(decimalPlaces),
    charges: chargeAmounts.map((c) => ({
      ...c,
      amount: c.amount.toFixed(decimalPlaces),
    })),
    taxable: taxable.toFixed(decimalPlaces),
    tax: tax.toFixed(decimalPlaces),
    grand: grand.toFixed(decimalPlaces),
  }
}

export function DocumentEditor({
  documentId,
  documentType,
  clientId,
  submissionId,
  editable,
  currency,
  decimalPlaces,
  taxLabel,
  taxRatePercent,
  charges,
  initial,
  initialLines,
  aiAvailable,
}: {
  documentId: string
  documentType: string
  clientId: string
  submissionId: string | null
  editable: boolean
  currency: string
  decimalPlaces: number
  taxLabel: string | null
  taxRatePercent: string | null
  charges: ChargePreview[]
  initial: {
    title: string
    scopeDescription: string
    servicePeriodLabel: string
    clientReference: string
    documentDate: string
    filename: string
    bodyContent: string
    terms: {
      paymentTerms?: string
      vatStatement?: string
      deliveryTime?: string
    }
  }
  initialLines: LineDraft[]
  aiAvailable: boolean
}) {
  const [state, formAction] = useActionState(saveDocumentAction, null)
  const [aiState, aiAction] = useActionState(draftScopeFromSubmissionAction, null)
  const [letterState, letterAction] = useActionState(draftLetterAction, null)
  const [body, setBody] = useState(initial.bodyContent)
  const [lines, setLines] = useState<LineDraft[]>(
    initialLines.length > 0 ? initialLines : [emptyLine()],
  )

  const totals = useMemo(
    () => previewTotals(lines, charges, taxRatePercent, decimalPlaces),
    [lines, charges, taxRatePercent, decimalPlaces],
  )

  function update(index: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  const aiDraft = aiState?.ok ? aiState.data : null
  const letterDraft = letterState?.ok ? letterState.data : null

  // A letter carries prose instead of priced lines.
  const isLetter = documentType === 'official_letter'

  return (
    <div className="space-y-5">
      {/* ---------------- AI drafting ---------------- */}
      {editable && submissionId ? (
        <Panel>
          <PanelHeader
            title="Draft from the site submission"
            description="The assistant writes wording only. It is never given prices and never returns figures."
          />
          <div className="space-y-3 p-4 sm:p-5">
            <FormResult state={aiState} />

            {!aiAvailable ? (
              <Notice tone="neutral">
                The AI assistant is not configured, so wording has to be written by hand. Everything
                else works normally.
              </Notice>
            ) : (
              <form action={aiAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="submissionId" value={submissionId} />
                <div className="min-w-48 flex-1">
                  <label
                    htmlFor="servicePeriodLabel-ai"
                    className="mb-1 block text-xs font-medium text-ink-700"
                  >
                    Service period (optional)
                  </label>
                  <Input
                    id="servicePeriodLabel-ai"
                    name="servicePeriodLabel"
                    placeholder="JUNE 2026"
                  />
                </div>
                <SubmitButton variant="secondary" pendingLabel="Drafting…">
                  <Sparkles className="size-4" aria-hidden="true" />
                  Draft scope and lines
                </SubmitButton>
              </form>
            )}

            {aiDraft ? (
              <div className="space-y-3 rounded border border-brand-200 bg-brand-50 p-3">
                <div>
                  <p className="text-xs font-medium text-brand-700 uppercase">Suggested scope</p>
                  <p className="mt-0.5 text-sm text-ink-900">{aiDraft.scopeLine}</p>
                </div>

                {aiDraft.lineDescriptions.length > 0 ? (
                  <div>
                    <p className="text-xs font-medium text-brand-700 uppercase">
                      Suggested line descriptions
                    </p>
                    <ul className="mt-1 space-y-1">
                      {aiDraft.lineDescriptions.map((d, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-ink-800">
                          <span className="text-ink-400">{i + 1}.</span>
                          <span className="flex-1">{d}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setLines((prev) => [
                                ...prev.filter((l) => l.description.trim() !== ''),
                                { ...emptyLine(), description: d },
                              ])
                            }
                            className="shrink-0 text-xs font-medium text-brand-700 hover:underline"
                          >
                            Use
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {aiDraft.missing.length > 0 ? (
                  <div>
                    <p className="text-xs font-medium text-warn-700 uppercase">
                      You still need to supply
                    </p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-700">
                      {aiDraft.missing.map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {aiDraft.concerns.length > 0 ? (
                  <div>
                    <p className="text-xs font-medium text-risk-700 uppercase">Worth checking</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-700">
                      {aiDraft.concerns.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <p className="text-xs text-ink-500">
                  Nothing here has been written to the document. Copy what is useful and edit it.
                </p>
              </div>
            ) : null}
          </div>
        </Panel>
      ) : null}

      {/* ---------------- The document ---------------- */}
      {/* ---------------- AI letter drafting ---------------- */}
      {editable && isLetter ? (
        <Panel>
          <PanelHeader
            title="Draft this letter"
            description="The assistant writes wording only. It is never given figures and never returns them."
          />
          <div className="space-y-3 p-4 sm:p-5">
            <FormResult state={letterState} />

            {!aiAvailable ? (
              <Notice tone="neutral">
                The AI assistant is not configured, so the letter has to be written by hand. Type it
                in the Letter panel below.
              </Notice>
            ) : (
              <form action={letterAction} className="space-y-3">
                <input type="hidden" name="clientId" value={clientId} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Subject"
                    htmlFor="letter-subject"
                    required
                    errors={errorsFor(letterState, 'subject')}
                  >
                    <Input id="letter-subject" name="subject" required maxLength={200} />
                  </Field>
                  <Field label="Tone" htmlFor="letter-tone">
                    <Select id="letter-tone" name="tone" defaultValue="neutral">
                      <option value="neutral">Neutral</option>
                      <option value="formal">Formal</option>
                      <option value="firm">Firm</option>
                      <option value="conciliatory">Conciliatory</option>
                    </Select>
                  </Field>
                </div>
                <Field
                  label="What should it say?"
                  htmlFor="letter-intent"
                  hint="A sentence or two. The assistant turns it into a letter; you keep editorial control."
                  errors={errorsFor(letterState, 'intent')}
                >
                  <Textarea id="letter-intent" name="intent" rows={3} required maxLength={4000} />
                </Field>
                <SubmitButton variant="secondary" pendingLabel="Drafting…">
                  <PenLine className="size-4" aria-hidden="true" />
                  Draft the letter
                </SubmitButton>
              </form>
            )}

            {letterDraft ? (
              <div className="space-y-3 rounded border border-brand-200 bg-brand-50 p-3">
                <div className="space-y-1 text-sm text-ink-900">
                  <p className="font-medium">{letterDraft.subject}</p>
                  <p>{letterDraft.salutation}</p>
                  <p className="whitespace-pre-wrap">{letterDraft.body}</p>
                  <p>{letterDraft.closing}</p>
                </div>

                {letterDraft.missing.length > 0 ? (
                  <div>
                    <p className="text-xs font-medium text-warn-700 uppercase">
                      The assistant could not supply
                    </p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-700">
                      {letterDraft.missing.map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={() =>
                    setBody(
                      [letterDraft.salutation, '', letterDraft.body, '', letterDraft.closing].join(
                        '\n',
                      ),
                    )
                  }
                  className="tap rounded border border-brand-600 bg-panel px-3 text-sm font-medium text-brand-700 hover:bg-brand-50"
                >
                  Put this in the letter
                </button>
                <p className="text-xs text-ink-500">
                  Nothing is saved until you save the document below.
                </p>
              </div>
            ) : null}
          </div>
        </Panel>
      ) : null}

      <form action={formAction} className="space-y-5" noValidate>
        <input type="hidden" name="documentId" value={documentId} />
        <input
          type="hidden"
          name="lines"
          value={JSON.stringify(
            lines
              .filter((l) => l.description.trim() !== '')
              .map((l) => ({
                kind: l.kind,
                description: l.description.trim(),
                itemCode: l.itemCode.trim() || undefined,
                quantity: l.quantity.trim() || '0',
                unit: l.unit.trim() || undefined,
                unitPrice: l.unitPrice.trim() || '0',
                discountPercent: l.discountPercent.trim() || undefined,
              })),
          )}
        />
        <input
          type="hidden"
          name="terms"
          value={JSON.stringify(initial.terms)}
          id="terms-payload"
        />

        <FormResult state={state} />

        <Panel>
          <PanelHeader title="Document details" />
          <fieldset disabled={!editable} className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <Field label="Title" htmlFor="title" required errors={errorsFor(state, 'title')}>
              <Input
                id="title"
                name="title"
                defaultValue={initial.title}
                required
                maxLength={200}
              />
            </Field>
            <Field label="Document date" htmlFor="documentDate">
              <Input
                id="documentDate"
                name="documentDate"
                type="date"
                defaultValue={initial.documentDate}
              />
            </Field>
            <Field
              label="Scope"
              htmlFor="scopeDescription"
              hint="Prints as the SCOPE: line."
              errors={errorsFor(state, 'scopeDescription')}
            >
              <Input
                id="scopeDescription"
                name="scopeDescription"
                defaultValue={initial.scopeDescription}
                placeholder="MAINTENANCE SERVICES"
                maxLength={2000}
              />
            </Field>
            <Field label="Service period" htmlFor="servicePeriodLabel">
              <Input
                id="servicePeriodLabel"
                name="servicePeriodLabel"
                defaultValue={initial.servicePeriodLabel}
                placeholder="JUNE 2026"
                maxLength={120}
              />
            </Field>
            <Field
              label="Client reference"
              htmlFor="clientReference"
              hint="Their reference, if they gave one."
            >
              <Input
                id="clientReference"
                name="clientReference"
                defaultValue={initial.clientReference}
                maxLength={120}
              />
            </Field>
            <Field
              label="Filename"
              htmlFor="filename"
              hint="Editable until the document is approved."
              errors={errorsFor(state, 'filename')}
            >
              <Input
                id="filename"
                name="filename"
                defaultValue={initial.filename}
                maxLength={200}
              />
            </Field>
          </fieldset>
        </Panel>

        {/* ---------------- Letter body ---------------- */}
        {isLetter ? (
          <Panel>
            <PanelHeader
              title="Letter"
              description="This is the text that will be printed under the letterhead."
            />
            <div className="space-y-3 p-4 sm:p-5">
              <Field label="Body" htmlFor="bodyContent" errors={errorsFor(state, 'bodyContent')}>
                <Textarea
                  id="bodyContent"
                  name="bodyContent"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={14}
                  maxLength={20000}
                  disabled={!editable}
                />
              </Field>
            </div>
          </Panel>
        ) : null}

        {/* ---------------- Lines ---------------- */}
        <Panel className={isLetter ? 'hidden' : undefined}>
          <PanelHeader
            title="Line items"
            description="Line totals are calculated, not typed. Quantity × unit price, less any discount."
            action={<Badge tone={lines.length > 0 ? 'brand' : 'neutral'}>{lines.length}</Badge>}
          />
          <div className="space-y-3 p-4 sm:p-5">
            {lines.map((line, index) => (
              <div key={index} className="rounded border border-ink-200 p-3">
                <div className="grid gap-2 sm:grid-cols-12">
                  <div className="sm:col-span-6">
                    <label className="mb-1 block text-xs font-medium text-ink-700">
                      Description
                    </label>
                    <Textarea
                      value={line.description}
                      onChange={(e) => update(index, { description: e.target.value })}
                      disabled={!editable}
                      rows={2}
                      maxLength={1000}
                      placeholder="Replace both drive-end bearings, renew shaft seal, re-align coupling"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-ink-700">Kind</label>
                    <Select
                      value={line.kind}
                      onChange={(e) => update(index, { kind: e.target.value })}
                      disabled={!editable}
                    >
                      {LINE_KINDS.map((k) => (
                        <option key={k.value} value={k.value}>
                          {k.label}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-ink-700">Quantity</label>
                    <Input
                      value={line.quantity}
                      onChange={(e) => update(index, { quantity: e.target.value })}
                      disabled={!editable}
                      inputMode="decimal"
                      className="tabular"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-ink-700">
                      Unit price
                    </label>
                    <Input
                      value={line.unitPrice}
                      onChange={(e) => update(index, { unitPrice: e.target.value })}
                      disabled={!editable}
                      inputMode="decimal"
                      className="tabular"
                    />
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs text-ink-500">
                    <span>Line total</span>
                    <span className="font-medium text-ink-900 tabular">
                      {currency} {formatAmount(totals.lineTotals[index] ?? '0', decimalPlaces)}
                    </span>
                  </div>

                  {editable ? (
                    <button
                      type="button"
                      onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                      className="flex items-center gap-1.5 rounded px-2 py-1 text-sm text-risk-600 hover:bg-risk-50"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            ))}

            {editable ? (
              <button
                type="button"
                onClick={() => setLines((prev) => [...prev, emptyLine()])}
                className="tap flex w-full items-center justify-center gap-2 rounded border border-dashed border-ink-300 px-4 text-sm font-medium text-ink-700 hover:bg-ink-50"
              >
                <Plus className="size-4" aria-hidden="true" />
                Add a line
              </button>
            ) : null}
          </div>

          {/* ---------------- Totals preview ---------------- */}
          <div className="border-t border-ink-200 bg-ink-50 px-4 py-3 sm:px-5">
            <dl className="ml-auto max-w-sm space-y-1 text-sm">
              <div className="flex justify-between gap-6">
                <dt className="text-ink-600">Sub total</dt>
                <dd className="font-medium text-ink-900 tabular">
                  {formatAmount(totals.subTotal, decimalPlaces)}
                </dd>
              </div>

              {totals.charges
                .filter((c) => c.appliesBeforeVat)
                .map((c, i) => (
                  <div key={i} className="flex justify-between gap-6">
                    <dt className="text-ink-600">
                      {c.label} ({c.ratePercent}%)
                    </dt>
                    <dd className="text-ink-900 tabular">
                      {formatAmount(c.amount, decimalPlaces)}
                    </dd>
                  </div>
                ))}

              {totals.charges.some((c) => c.appliesBeforeVat) ? (
                <div className="flex justify-between gap-6 border-t border-ink-200 pt-1">
                  <dt className="text-ink-600">Total</dt>
                  <dd className="font-medium text-ink-900 tabular">
                    {formatAmount(totals.taxable, decimalPlaces)}
                  </dd>
                </div>
              ) : null}

              {taxRatePercent ? (
                <div className="flex justify-between gap-6">
                  <dt className="text-ink-600">
                    {taxLabel ?? 'VAT'} ({taxRatePercent}%)
                  </dt>
                  <dd className="text-ink-900 tabular">
                    {formatAmount(totals.tax, decimalPlaces)}
                  </dd>
                </div>
              ) : null}

              <div className="flex justify-between gap-6 border-t border-ink-300 pt-1.5">
                <dt className="font-semibold text-ink-900">Grand total</dt>
                <dd className="font-semibold text-ink-900 tabular">
                  {currency} {formatAmount(totals.grand, decimalPlaces)}
                </dd>
              </div>
            </dl>

            <p className="mt-2 text-xs text-ink-400">
              Preview only. Saving recalculates every figure on the server from approved company
              settings, and the server’s result is what the document carries.
            </p>
          </div>
        </Panel>

        {editable ? (
          <SubmitButton size="lg" pendingLabel="Saving…">
            <FileText className="size-4" aria-hidden="true" />
            Save and recalculate
          </SubmitButton>
        ) : null}
      </form>
    </div>
  )
}

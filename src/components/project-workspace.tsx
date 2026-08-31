'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import {
  CheckCircle2,
  FileText,
  Package,
  Plus,
  Receipt,
  ShieldCheck,
  Truck,
  UserPlus,
} from 'lucide-react'
import { Badge, Field, Input, Notice, Panel, PanelHeader, Select, Textarea } from '@/components/ui'
import { errorsFor, FormResult, SubmitButton } from '@/components/form'
import { formatAmount } from '@/lib/finance/decimal'
import {
  DELIVERY_STATUS,
  DOCUMENT_STATUS,
  DOCUMENT_TYPE_LABELS,
  PO_STATUS,
  SUBMISSION_STATUS,
  formatDate,
  relativeTime,
  type SubmissionStatus,
} from '@/lib/display'
import {
  cancelPurchaseOrderAction,
  createDeliveryAction,
  recordCompletionAction,
  recordPurchaseOrderAction,
  saveClientContactAction,
  verifyCompletionAction,
} from '@/server/operations-actions'

/**
 * The project workspace.
 *
 * One screen for everything that hangs off a client engagement, because a
 * Technical Officer working an invoice needs the PO, the delivery and the
 * completion evidence in the same place — chasing them across four screens is
 * how evidence gets missed.
 */

type Tab = 'overview' | 'purchase_orders' | 'deliveries' | 'completion' | 'contacts'

export function ProjectWorkspace(props: {
  projectId: string
  clientId: string
  clientName: string
  members: Array<{ id: string; userId: string; isLead: boolean; fullName: string }>
  contacts: Array<{
    id: string
    fullName: string
    jobTitle: string | null
    phone: string | null
    email: string | null
    isPrimary: boolean
    receivesDocuments: boolean
  }>
  purchaseOrders: Array<{
    id: string
    poNumber: string
    poDate: string | null
    status: string
    currency: string
    orderValue: string | null
    description: string | null
    hasDocument: boolean
  }>
  submissions: Array<{
    id: string
    reference: string | null
    title: string
    status: string
    urgency: string
    submittedAt: string | null
    authorName: string
  }>
  documents: Array<{
    id: string
    reference: string | null
    documentType: string
    title: string
    status: string
    currency: string
    grandTotal: string | null
    updatedAt: string
  }>
  deliveries: Array<{
    id: string
    deliveryDate: string
    status: string
    location: string | null
    handoverPersonName: string
    receiverName: string | null
    hasHandoverSignature: boolean
    hasReceiverSignature: boolean
  }>
  completions: Array<{
    id: string
    source: string
    completedOn: string
    acceptedByName: string | null
    verifiedAt: string | null
    verifierName: string | null
    hasEvidence: boolean
  }>
  engineers: Array<{ id: string; fullName: string }>
  invoiceReady: boolean
  canManagePo: boolean
  canManageDelivery: boolean
  canManageCompletion: boolean
  canManageClient: boolean
}) {
  const [tab, setTab] = useState<Tab>('overview')

  const [poState, poAction] = useActionState(recordPurchaseOrderAction, null)
  const [poCancelState, poCancelAction] = useActionState(cancelPurchaseOrderAction, null)
  const [contactState, contactAction] = useActionState(saveClientContactAction, null)
  const [deliveryState, deliveryAction] = useActionState(createDeliveryAction, null)
  const [completionState, completionAction] = useActionState(recordCompletionAction, null)
  const [verifyState, verifyAction] = useActionState(verifyCompletionAction, null)

  const [showForm, setShowForm] = useState(false)
  const [items, setItems] = useState<Array<{ description: string; quantity: string; unit: string }>>(
    [{ description: '', quantity: '1', unit: '' }],
  )

  const tabs: Array<[Tab, string, number]> = [
    ['overview', 'Overview', props.submissions.length + props.documents.length],
    ['purchase_orders', 'Purchase Orders', props.purchaseOrders.length],
    ['deliveries', 'Deliveries', props.deliveries.length],
    ['completion', 'Completion', props.completions.length],
    ['contacts', 'Contacts', props.contacts.length],
  ]

  return (
    <>
      <Notice tone={props.invoiceReady ? 'ok' : 'warn'}>
        {props.invoiceReady ? (
          <>
            <span className="font-medium">Invoicing is unlocked for this project.</span> There is a
            confirmed delivery or verified completion evidence on file.
          </>
        ) : (
          <>
            <span className="font-medium">A tax invoice cannot be approved yet.</span> It needs a
            client Purchase Order plus either a confirmed Delivery Note or verified completion
            evidence. Record those below.
          </>
        )}
      </Notice>

      <div className="flex gap-1 overflow-x-auto border-b border-ink-200">
        {tabs.map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setTab(key)
              setShowForm(false)
            }}
            aria-current={tab === key ? 'page' : undefined}
            className={`tap shrink-0 border-b-2 px-3 text-sm font-medium transition-colors ${
              tab === key
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-ink-500 hover:text-ink-800'
            }`}
          >
            {label}
            <span className="ml-1.5 text-xs text-ink-400 tabular">{count}</span>
          </button>
        ))}
      </div>

      {/* ---------------- Overview ---------------- */}
      {tab === 'overview' ? (
        <>
          <Panel>
            <PanelHeader title="Team on this project" />
            <div className="flex flex-wrap gap-2 p-4 sm:p-5">
              {props.members.length === 0 ? (
                <p className="text-sm text-ink-500">
                  Nobody assigned. An Engineer cannot file against this project until they are.
                </p>
              ) : (
                props.members.map((m) => (
                  <Badge key={m.id} tone={m.isLead ? 'brand' : 'neutral'}>
                    {m.fullName}
                    {m.isLead ? ' · Lead' : ''}
                  </Badge>
                ))
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Site submissions" />
            {props.submissions.length === 0 ? (
              <p className="px-4 py-5 text-sm text-ink-500 sm:px-5">Nothing filed yet.</p>
            ) : (
              <div className="divide-y divide-ink-100">
                {props.submissions.map((s) => {
                  const status = SUBMISSION_STATUS[s.status as SubmissionStatus]
                  return (
                    <Link
                      key={s.id}
                      href={`/technical/submissions/${s.id}`}
                      className="block px-4 py-3 hover:bg-ink-50 sm:px-5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={status?.tone ?? 'neutral'}>{status?.label ?? s.status}</Badge>
                        {s.reference ? (
                          <span className="font-mono text-xs text-ink-400">{s.reference}</span>
                        ) : null}
                      </div>
                      <p className="mt-1 font-medium text-ink-900">{s.title}</p>
                      <p className="mt-0.5 text-xs text-ink-400">
                        {s.authorName} · {relativeTime(s.submittedAt)}
                      </p>
                    </Link>
                  )
                })}
              </div>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Documents" />
            {props.documents.length === 0 ? (
              <p className="px-4 py-5 text-sm text-ink-500 sm:px-5">
                No documents yet. Accept a submission to draft a quotation from it.
              </p>
            ) : (
              <div className="divide-y divide-ink-100">
                {props.documents.map((d) => {
                  const status = DOCUMENT_STATUS[d.status] ?? {
                    label: d.status,
                    tone: 'neutral' as const,
                  }
                  return (
                    <Link
                      key={d.id}
                      href={`/technical/documents/${d.id}`}
                      className="block px-4 py-3 hover:bg-ink-50 sm:px-5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="neutral">
                          {DOCUMENT_TYPE_LABELS[d.documentType] ?? d.documentType}
                        </Badge>
                        <Badge tone={status.tone}>{status.label}</Badge>
                        {d.reference ? (
                          <span className="font-mono text-xs text-ink-400">{d.reference}</span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-medium text-ink-900">{d.title}</p>
                        {d.grandTotal ? (
                          <p className="text-sm font-medium text-ink-900 tabular">
                            {d.currency} {formatAmount(d.grandTotal)}
                          </p>
                        ) : null}
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </Panel>
        </>
      ) : null}

      {/* ---------------- Purchase Orders ---------------- */}
      {tab === 'purchase_orders' ? (
        <>
          <FormResult state={poCancelState} />

          {props.canManagePo ? (
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="tap inline-flex items-center gap-2 rounded bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 sm:self-start"
            >
              <Plus className="size-4" aria-hidden="true" />
              {showForm ? 'Close' : 'Record a Purchase Order'}
            </button>
          ) : null}

          {showForm ? (
            <Panel>
              <PanelHeader
                title="Record the client's Purchase Order"
                description="The client issues this number. Type it exactly as it appears on their document — the platform never generates one."
              />
              <form action={poAction} className="space-y-4 p-4 sm:p-5" noValidate>
                <FormResult state={poState} />
                <input type="hidden" name="projectId" value={props.projectId} />
                <input type="hidden" name="clientId" value={props.clientId} />

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Purchase Order number"
                    htmlFor="poNumber"
                    hint="Exactly as the client wrote it, e.g. PO_4500848755"
                    required
                    errors={errorsFor(poState, 'poNumber')}
                  >
                    <Input id="poNumber" name="poNumber" required maxLength={80} className="font-mono" />
                  </Field>

                  <Field label="Their PO date" htmlFor="poDate" errors={errorsFor(poState, 'poDate')}>
                    <Input id="poDate" name="poDate" type="date" />
                  </Field>

                  <Field label="Currency" htmlFor="currency">
                    <Input id="currency" name="currency" defaultValue="TZS" maxLength={3} />
                  </Field>

                  <Field
                    label="Order value"
                    htmlFor="orderValue"
                    hint="As stated on their PO, for reconciliation."
                    errors={errorsFor(poState, 'orderValue')}
                  >
                    <Input id="orderValue" name="orderValue" inputMode="decimal" className="tabular" />
                  </Field>
                </div>

                <Field label="Description" htmlFor="description">
                  <Textarea id="description" name="description" rows={2} maxLength={2000} />
                </Field>

                <Field
                  label="Their original PO document"
                  htmlFor="document"
                  hint="Stored exactly as received and never replaced."
                  errors={errorsFor(poState, 'file')}
                >
                  <input
                    id="document"
                    name="document"
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    className="tap w-full rounded border border-ink-300 bg-white px-3 text-sm"
                  />
                </Field>

                <SubmitButton pendingLabel="Recording…">Record Purchase Order</SubmitButton>
              </form>
            </Panel>
          ) : null}

          <Panel className="divide-y divide-ink-100">
            {props.purchaseOrders.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-ink-500">
                No Purchase Order recorded. A tax invoice cannot be raised without one.
              </p>
            ) : (
              props.purchaseOrders.map((po) => {
                const status = PO_STATUS[po.status] ?? { label: po.status, tone: 'neutral' as const }
                return (
                  <div key={po.id} className="px-4 py-3.5 sm:px-5">
                    <div className="flex flex-wrap items-start gap-3">
                      <Receipt className="mt-0.5 size-4 shrink-0 text-ink-400" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-mono font-medium text-ink-900">{po.poNumber}</p>
                          <Badge tone={status.tone}>{status.label}</Badge>
                          {po.hasDocument ? <Badge tone="ok">Original on file</Badge> : null}
                        </div>
                        {po.description ? (
                          <p className="mt-0.5 text-sm text-ink-600">{po.description}</p>
                        ) : null}
                        <p className="mt-1 text-xs text-ink-400 tabular">
                          {po.poDate ? formatDate(po.poDate) : 'No date'}
                          {po.orderValue ? ` · ${po.currency} ${formatAmount(po.orderValue)}` : ''}
                        </p>
                      </div>

                      {props.canManagePo && po.status !== 'cancelled' ? (
                        <form action={poCancelAction} className="flex items-end gap-2">
                          <input type="hidden" name="purchaseOrderId" value={po.id} />
                          <input
                            type="text"
                            name="reason"
                            placeholder="Reason to cancel"
                            className="h-9 w-40 rounded border border-ink-300 px-2 text-sm"
                          />
                          <SubmitButton variant="ghost" size="sm" pendingLabel="Cancelling…">
                            Cancel
                          </SubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </div>
                )
              })
            )}
          </Panel>

          <p className="text-xs text-ink-400">
            A recorded PO number can never be edited. If one is entered wrongly, cancel it and
            record the correct order — both stay in the audit trail.
          </p>
        </>
      ) : null}

      {/* ---------------- Deliveries ---------------- */}
      {tab === 'deliveries' ? (
        <>
          {props.canManageDelivery ? (
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="tap inline-flex items-center gap-2 rounded bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 sm:self-start"
            >
              <Plus className="size-4" aria-hidden="true" />
              {showForm ? 'Close' : 'Record a delivery'}
            </button>
          ) : null}

          {showForm ? (
            <Panel>
              <PanelHeader
                title="Record a delivery"
                description="Both sides sign on the delivery record itself. Confirmed deliveries unlock invoicing."
              />
              <form action={deliveryAction} className="space-y-4 p-4 sm:p-5" noValidate>
                <FormResult state={deliveryState} />
                <input type="hidden" name="projectId" value={props.projectId} />
                <input
                  type="hidden"
                  name="items"
                  value={JSON.stringify(
                    items
                      .filter((i) => i.description.trim() !== '')
                      .map((i) => ({
                        description: i.description.trim(),
                        quantity: i.quantity.trim() || '1',
                        unit: i.unit.trim() || undefined,
                      })),
                  )}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Delivery date"
                    htmlFor="deliveryDate"
                    required
                    errors={errorsFor(deliveryState, 'deliveryDate')}
                  >
                    <Input id="deliveryDate" name="deliveryDate" type="date" required />
                  </Field>

                  <Field label="Purchase Order" htmlFor="clientPurchaseOrderId">
                    <Select id="clientPurchaseOrderId" name="clientPurchaseOrderId">
                      <option value="">Not against a specific PO</option>
                      {props.purchaseOrders
                        .filter((p) => p.status !== 'cancelled')
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.poNumber}
                          </option>
                        ))}
                    </Select>
                  </Field>

                  <Field
                    label="Delivered by (HA GROUP)"
                    htmlFor="handoverPersonName"
                    required
                    errors={errorsFor(deliveryState, 'handoverPersonName')}
                  >
                    <Input id="handoverPersonName" name="handoverPersonName" required maxLength={160} />
                  </Field>

                  <Field label="Received by (client)" htmlFor="receiverName">
                    <Input id="receiverName" name="receiverName" maxLength={160} />
                  </Field>

                  <Field label="Their job title" htmlFor="receiverTitle">
                    <Input id="receiverTitle" name="receiverTitle" maxLength={120} />
                  </Field>

                  <Field label="Location" htmlFor="location">
                    <Input id="location" name="location" maxLength={300} />
                  </Field>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-ink-800">What was delivered</p>
                  {items.map((item, index) => (
                    <div key={index} className="grid gap-2 sm:grid-cols-12">
                      <div className="sm:col-span-8">
                        <Input
                          placeholder="Description"
                          value={item.description}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((it, i) =>
                                i === index ? { ...it, description: e.target.value } : it,
                              ),
                            )
                          }
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Input
                          placeholder="Qty"
                          inputMode="decimal"
                          className="tabular"
                          value={item.quantity}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((it, i) =>
                                i === index ? { ...it, quantity: e.target.value } : it,
                              ),
                            )
                          }
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Input
                          placeholder="Unit"
                          value={item.unit}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((it, i) => (i === index ? { ...it, unit: e.target.value } : it)),
                            )
                          }
                        />
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setItems((prev) => [...prev, { description: '', quantity: '1', unit: '' }])
                    }
                    className="tap flex w-full items-center justify-center gap-2 rounded border border-dashed border-ink-300 px-4 text-sm font-medium text-ink-700 hover:bg-ink-50"
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    Add an item
                  </button>
                </div>

                <Field label="Notes" htmlFor="delivery-notes">
                  <Textarea id="delivery-notes" name="notes" rows={2} maxLength={2000} />
                </Field>

                <SubmitButton pendingLabel="Recording…">Record delivery</SubmitButton>
              </form>
            </Panel>
          ) : null}

          <Panel className="divide-y divide-ink-100">
            {props.deliveries.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-ink-500">
                No deliveries recorded for this project.
              </p>
            ) : (
              props.deliveries.map((d) => {
                const status = DELIVERY_STATUS[d.status] ?? {
                  label: d.status,
                  tone: 'neutral' as const,
                }
                return (
                  <Link
                    key={d.id}
                    href={`/technical/deliveries/${d.id}`}
                    className="block px-4 py-3.5 hover:bg-ink-50 sm:px-5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Truck className="size-4 text-ink-400" aria-hidden="true" />
                      <Badge tone={status.tone}>{status.label}</Badge>
                      <span className="text-sm text-ink-600">{formatDate(d.deliveryDate)}</span>
                    </div>
                    <p className="mt-1 text-sm text-ink-900">
                      {d.handoverPersonName} → {d.receiverName ?? 'client'}
                    </p>
                    <p className="mt-1 text-xs text-ink-400">
                      {d.hasHandoverSignature ? '✓ HA GROUP signed' : '○ HA GROUP not signed'} ·{' '}
                      {d.hasReceiverSignature ? '✓ client signed' : '○ client not signed'}
                    </p>
                  </Link>
                )
              })
            )}
          </Panel>
        </>
      ) : null}

      {/* ---------------- Completion ---------------- */}
      {tab === 'completion' ? (
        <>
          <FormResult state={verifyState} />

          {props.canManageCompletion ? (
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="tap inline-flex items-center gap-2 rounded bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 sm:self-start"
            >
              <Plus className="size-4" aria-hidden="true" />
              {showForm ? 'Close' : 'Record completion evidence'}
            </button>
          ) : null}

          {showForm ? (
            <Panel>
              <PanelHeader
                title="Record completion evidence"
                description="Either HA GROUP's own certificate, or the client's acceptance form signed by your engineer."
              />
              <form action={completionAction} className="space-y-4 p-4 sm:p-5" noValidate>
                <FormResult state={completionState} />
                <input type="hidden" name="projectId" value={props.projectId} />

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Source" htmlFor="source" required>
                    <Select id="source" name="source" required defaultValue="client_acceptance">
                      <option value="client_acceptance">
                        The client&rsquo;s own signed acceptance form
                      </option>
                      <option value="ha_group_certificate">HA GROUP Completion Certificate</option>
                    </Select>
                  </Field>

                  <Field
                    label="Completed on"
                    htmlFor="completedOn"
                    required
                    errors={errorsFor(completionState, 'completedOn')}
                  >
                    <Input id="completedOn" name="completedOn" type="date" required />
                  </Field>

                  <Field label="Purchase Order" htmlFor="completion-po">
                    <Select id="completion-po" name="clientPurchaseOrderId">
                      <option value="">Not against a specific PO</option>
                      {props.purchaseOrders
                        .filter((p) => p.status !== 'cancelled')
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.poNumber}
                          </option>
                        ))}
                    </Select>
                  </Field>

                  <Field label="HA GROUP engineer who signed" htmlFor="engineerId">
                    <Select id="engineerId" name="engineerId">
                      <option value="">Not recorded</option>
                      {props.engineers.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.fullName}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field label="Accepted by (client)" htmlFor="acceptedByName">
                    <Input id="acceptedByName" name="acceptedByName" maxLength={160} />
                  </Field>

                  <Field label="Their job title" htmlFor="acceptedByTitle">
                    <Input id="acceptedByTitle" name="acceptedByTitle" maxLength={120} />
                  </Field>
                </div>

                <Field label="Work completed" htmlFor="workDescription">
                  <Textarea id="workDescription" name="workDescription" rows={3} maxLength={4000} />
                </Field>

                <Field
                  label="Signed evidence"
                  htmlFor="evidence"
                  hint="Required for a client acceptance form. Stored exactly as received."
                  errors={errorsFor(completionState, 'evidence')}
                >
                  <input
                    id="evidence"
                    name="evidence"
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    className="tap w-full rounded border border-ink-300 bg-white px-3 text-sm"
                  />
                </Field>

                <SubmitButton pendingLabel="Recording…">Record evidence</SubmitButton>
              </form>
            </Panel>
          ) : null}

          <Panel className="divide-y divide-ink-100">
            {props.completions.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-ink-500">
                No completion evidence on file.
              </p>
            ) : (
              props.completions.map((c) => (
                <div key={c.id} className="px-4 py-3.5 sm:px-5">
                  <div className="flex flex-wrap items-start gap-3">
                    <Package className="mt-0.5 size-4 shrink-0 text-ink-400" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={c.verifiedAt ? 'ok' : 'warn'}>
                          {c.verifiedAt ? 'Verified' : 'Awaiting verification'}
                        </Badge>
                        <Badge tone="neutral">
                          {c.source === 'client_acceptance'
                            ? 'Client acceptance'
                            : 'HA GROUP certificate'}
                        </Badge>
                        {c.hasEvidence ? <Badge tone="neutral">Document on file</Badge> : null}
                      </div>
                      <p className="mt-1 text-sm text-ink-900">
                        Completed {formatDate(c.completedOn)}
                        {c.acceptedByName ? ` · accepted by ${c.acceptedByName}` : ''}
                      </p>
                      {c.verifiedAt ? (
                        <p className="mt-0.5 text-xs text-ink-400">
                          Verified by {c.verifierName} on {formatDate(c.verifiedAt)}
                        </p>
                      ) : null}
                    </div>

                    {props.canManageCompletion && !c.verifiedAt ? (
                      <form action={verifyAction}>
                        <input type="hidden" name="completionId" value={c.id} />
                        <SubmitButton size="sm" pendingLabel="Verifying…">
                          <ShieldCheck className="size-4" aria-hidden="true" />
                          Verify
                        </SubmitButton>
                      </form>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </Panel>

          <p className="text-xs text-ink-400">
            Uploading evidence is not enough on its own — a Technical Officer must verify it before
            it unlocks invoicing. That is deliberate.
          </p>
        </>
      ) : null}

      {/* ---------------- Contacts ---------------- */}
      {tab === 'contacts' ? (
        <>
          {props.canManageClient ? (
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="tap inline-flex items-center gap-2 rounded bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 sm:self-start"
            >
              <UserPlus className="size-4" aria-hidden="true" />
              {showForm ? 'Close' : 'Add a contact'}
            </button>
          ) : null}

          {showForm ? (
            <Panel>
              <PanelHeader
                title={`New contact at ${props.clientName}`}
                description="Site, procurement and finance are usually different people."
              />
              <form action={contactAction} className="space-y-4 p-4 sm:p-5" noValidate>
                <FormResult state={contactState} />
                <input type="hidden" name="clientId" value={props.clientId} />

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Full name"
                    htmlFor="fullName"
                    required
                    errors={errorsFor(contactState, 'fullName')}
                  >
                    <Input id="fullName" name="fullName" required maxLength={160} />
                  </Field>
                  <Field label="Job title" htmlFor="jobTitle">
                    <Input id="jobTitle" name="jobTitle" maxLength={120} />
                  </Field>
                  <Field label="Phone" htmlFor="contact-phone">
                    <Input id="contact-phone" name="phone" type="tel" maxLength={40} />
                  </Field>
                  <Field label="Email" htmlFor="contact-email">
                    <Input id="contact-email" name="email" type="email" maxLength={254} />
                  </Field>
                </div>

                <div className="space-y-2">
                  <label className="tap flex items-center gap-2.5 text-sm text-ink-800">
                    <input type="checkbox" name="isPrimary" className="size-4 accent-brand-600" />
                    Primary contact for this client
                  </label>
                  <label className="tap flex items-center gap-2.5 text-sm text-ink-800">
                    <input
                      type="checkbox"
                      name="receivesDocuments"
                      className="size-4 accent-brand-600"
                    />
                    Receives quotations and invoices
                  </label>
                </div>

                <SubmitButton pendingLabel="Saving…">Add contact</SubmitButton>
              </form>
            </Panel>
          ) : null}

          <Panel className="divide-y divide-ink-100">
            {props.contacts.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-ink-500">
                No contacts recorded for this client.
              </p>
            ) : (
              props.contacts.map((c) => (
                <div key={c.id} className="px-4 py-3.5 sm:px-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-ink-900">{c.fullName}</p>
                    {c.isPrimary ? <Badge tone="brand">Primary</Badge> : null}
                    {c.receivesDocuments ? <Badge tone="neutral">Receives documents</Badge> : null}
                  </div>
                  <p className="mt-0.5 text-sm text-ink-500">
                    {[c.jobTitle, c.phone, c.email].filter(Boolean).join(' · ') || 'No details'}
                  </p>
                </div>
              ))
            )}
          </Panel>
        </>
      ) : null}
    </>
  )
}

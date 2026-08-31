'use client'

import { useActionState, useState } from 'react'
import { Archive, Plus } from 'lucide-react'
import { Badge, EmptyState, Field, Input, Panel, PanelHeader, Textarea } from '@/components/ui'
import { errorsFor, FormResult, SubmitButton } from '@/components/form'
import { archiveClientAction, createClientAction } from '@/server/records-actions'

interface ClientRow {
  id: string
  legalName: string
  tradingName: string | null
  tin: string | null
  vrn: string | null
  city: string | null
  contactPerson: string | null
  contactPhone: string | null
  contactEmail: string | null
  status: string
  projectCount: number
}

export function ClientManager({ clients }: { clients: ClientRow[] }) {
  const [createState, createAction] = useActionState(createClientAction, null)
  const [archiveState, archiveAction] = useActionState(archiveClientAction, null)
  const [showForm, setShowForm] = useState(false)
  const [query, setQuery] = useState('')

  const filtered = clients.filter((c) => {
    if (query.trim() === '') return true
    const q = query.toLowerCase()
    return (
      c.legalName.toLowerCase().includes(q) ||
      (c.tradingName ?? '').toLowerCase().includes(q) ||
      (c.tin ?? '').includes(q)
    )
  })

  return (
    <>
      <FormResult state={archiveState} />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          type="search"
          placeholder="Search by name or TIN…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="sm:max-w-xs"
          aria-label="Search clients"
        />
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="tap flex items-center justify-center gap-2 rounded bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 sm:ml-auto"
        >
          <Plus className="size-4" aria-hidden="true" />
          {showForm ? 'Close' : 'Add a client'}
        </button>
      </div>

      {showForm ? (
        <Panel>
          <PanelHeader title="New client" />
          <form action={createAction} className="space-y-4 p-4 sm:p-5" noValidate>
            <FormResult state={createState} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Registered company name"
                htmlFor="legalName"
                required
                errors={errorsFor(createState, 'legalName')}
              >
                <Input id="legalName" name="legalName" required maxLength={200} />
              </Field>
              <Field label="Trading name" htmlFor="tradingName">
                <Input id="tradingName" name="tradingName" maxLength={200} />
              </Field>
              <Field
                label="TIN"
                htmlFor="tin"
                hint="Nine digits, e.g. 100-228-211."
                errors={errorsFor(createState, 'tin')}
              >
                <Input id="tin" name="tin" inputMode="numeric" maxLength={20} className="tabular" />
              </Field>
              <Field label="VRN" htmlFor="vrn" errors={errorsFor(createState, 'vrn')}>
                <Input id="vrn" name="vrn" maxLength={20} className="tabular" />
              </Field>
              <Field label="Address" htmlFor="addressLine1">
                <Input id="addressLine1" name="addressLine1" maxLength={200} />
              </Field>
              <Field label="Postal address" htmlFor="postalAddress">
                <Input id="postalAddress" name="postalAddress" maxLength={120} />
              </Field>
              <Field label="Town or city" htmlFor="city">
                <Input id="city" name="city" maxLength={120} />
              </Field>
              <Field label="Country" htmlFor="country">
                <Input id="country" name="country" defaultValue="Tanzania" maxLength={80} />
              </Field>
              <Field label="Contact person" htmlFor="contactPerson">
                <Input id="contactPerson" name="contactPerson" maxLength={160} />
              </Field>
              <Field
                label="Contact phone"
                htmlFor="contactPhone"
                errors={errorsFor(createState, 'contactPhone')}
              >
                <Input id="contactPhone" name="contactPhone" type="tel" maxLength={40} />
              </Field>
              <Field
                label="Contact email"
                htmlFor="contactEmail"
                errors={errorsFor(createState, 'contactEmail')}
              >
                <Input id="contactEmail" name="contactEmail" type="email" maxLength={254} />
              </Field>
            </div>

            <Field label="Notes" htmlFor="notes">
              <Textarea id="notes" name="notes" rows={2} maxLength={2000} />
            </Field>

            <SubmitButton pendingLabel="Saving…">Add client</SubmitButton>
          </form>
        </Panel>
      ) : null}

      <Panel className="divide-y divide-ink-100">
        {filtered.length === 0 ? (
          <EmptyState
            title={query ? 'No clients match that search' : 'No clients yet'}
            description={
              query
                ? 'Try part of the company name or the TIN.'
                : 'Add the companies HA GROUP works for. Projects and documents hang off these records.'
            }
          />
        ) : (
          filtered.map((c) => (
            <div key={c.id} className="flex flex-wrap items-start gap-3 px-4 py-3.5 sm:px-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-ink-900">{c.legalName}</p>
                  {c.status !== 'active' ? (
                    <Badge tone="neutral">{c.status === 'archived' ? 'Archived' : 'Inactive'}</Badge>
                  ) : null}
                </div>
                <p className="mt-0.5 text-sm text-ink-500">
                  {[c.city, c.contactPerson, c.contactPhone].filter(Boolean).join(' · ') ||
                    'No contact details on file'}
                </p>
                <p className="mt-1 text-xs text-ink-400 tabular">
                  {c.tin ? `TIN ${c.tin}` : 'No TIN'}
                  {c.vrn ? ` · VRN ${c.vrn}` : ''} · {c.projectCount} project
                  {c.projectCount === 1 ? '' : 's'}
                </p>
              </div>

              {c.status === 'active' ? (
                <form action={archiveAction}>
                  <input type="hidden" name="clientId" value={c.id} />
                  <SubmitButton variant="ghost" size="sm" pendingLabel="Archiving…">
                    <Archive className="size-4" aria-hidden="true" />
                    Archive
                  </SubmitButton>
                </form>
              ) : null}
            </div>
          ))
        )}
      </Panel>

      <p className="text-xs text-ink-400">
        Clients are archived, never deleted — historical quotations and invoices must always resolve
        to a real counterparty.
      </p>
    </>
  )
}

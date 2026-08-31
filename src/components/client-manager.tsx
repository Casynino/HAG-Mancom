'use client'

import { useActionState, useState } from 'react'
import { Archive, Pencil, Plus } from 'lucide-react'
import { Badge, EmptyState, Field, Input, Panel, PanelHeader, Textarea } from '@/components/ui'
import { errorsFor, FormResult, SubmitButton } from '@/components/form'
import {
  archiveClientAction,
  createClientAction,
  updateClientAction,
} from '@/server/records-actions'

interface ClientRow {
  id: string
  legalName: string
  tradingName: string | null
  tin: string | null
  vrn: string | null
  registrationNumber: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  region: string | null
  postalAddress: string | null
  country: string
  contactPerson: string | null
  contactPhone: string | null
  contactEmail: string | null
  notes: string | null
  status: string
  projectCount: number
}

/**
 * One set of fields, used for both adding and correcting a client.
 *
 * Keeping them in a single component is the point: a field that exists on the
 * "add" form but not the "edit" form becomes a value nobody can ever fix.
 */
function ClientFields({
  state,
  client,
}: {
  state: Parameters<typeof errorsFor>[0]
  client?: ClientRow
}) {
  const p = (n: string) => (client ? `${client.id}-${n}` : n)
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Registered company name"
          htmlFor={p('legalName')}
          required
          errors={errorsFor(state, 'legalName')}
        >
          <Input
            id={p('legalName')}
            name="legalName"
            required
            maxLength={200}
            defaultValue={client?.legalName ?? ''}
          />
        </Field>
        <Field label="Trading name" htmlFor={p('tradingName')}>
          <Input
            id={p('tradingName')}
            name="tradingName"
            maxLength={200}
            defaultValue={client?.tradingName ?? ''}
          />
        </Field>
        <Field
          label="TIN"
          htmlFor={p('tin')}
          hint="Nine digits, e.g. 100-228-211."
          errors={errorsFor(state, 'tin')}
        >
          <Input
            id={p('tin')}
            name="tin"
            inputMode="numeric"
            maxLength={20}
            className="tabular"
            defaultValue={client?.tin ?? ''}
          />
        </Field>
        <Field label="VRN" htmlFor={p('vrn')} errors={errorsFor(state, 'vrn')}>
          <Input
            id={p('vrn')}
            name="vrn"
            maxLength={20}
            className="tabular"
            defaultValue={client?.vrn ?? ''}
          />
        </Field>
        <Field label="Registration number" htmlFor={p('registrationNumber')}>
          <Input
            id={p('registrationNumber')}
            name="registrationNumber"
            maxLength={60}
            defaultValue={client?.registrationNumber ?? ''}
          />
        </Field>
        <Field label="Address" htmlFor={p('addressLine1')}>
          <Input
            id={p('addressLine1')}
            name="addressLine1"
            maxLength={200}
            defaultValue={client?.addressLine1 ?? ''}
          />
        </Field>
        <Field label="Address line 2" htmlFor={p('addressLine2')}>
          <Input
            id={p('addressLine2')}
            name="addressLine2"
            maxLength={200}
            defaultValue={client?.addressLine2 ?? ''}
          />
        </Field>
        <Field label="Postal address" htmlFor={p('postalAddress')}>
          <Input
            id={p('postalAddress')}
            name="postalAddress"
            maxLength={120}
            defaultValue={client?.postalAddress ?? ''}
          />
        </Field>
        <Field label="Town or city" htmlFor={p('city')}>
          <Input id={p('city')} name="city" maxLength={120} defaultValue={client?.city ?? ''} />
        </Field>
        <Field label="Region" htmlFor={p('region')}>
          <Input
            id={p('region')}
            name="region"
            maxLength={120}
            defaultValue={client?.region ?? ''}
          />
        </Field>
        <Field label="Country" htmlFor={p('country')}>
          <Input
            id={p('country')}
            name="country"
            maxLength={80}
            defaultValue={client?.country ?? 'Tanzania'}
          />
        </Field>
        <Field label="Contact person" htmlFor={p('contactPerson')}>
          <Input
            id={p('contactPerson')}
            name="contactPerson"
            maxLength={160}
            defaultValue={client?.contactPerson ?? ''}
          />
        </Field>
        <Field
          label="Contact phone"
          htmlFor={p('contactPhone')}
          errors={errorsFor(state, 'contactPhone')}
        >
          <Input
            id={p('contactPhone')}
            name="contactPhone"
            type="tel"
            maxLength={40}
            defaultValue={client?.contactPhone ?? ''}
          />
        </Field>
        <Field
          label="Contact email"
          htmlFor={p('contactEmail')}
          errors={errorsFor(state, 'contactEmail')}
        >
          <Input
            id={p('contactEmail')}
            name="contactEmail"
            type="email"
            maxLength={254}
            defaultValue={client?.contactEmail ?? ''}
          />
        </Field>
      </div>

      <Field label="Notes" htmlFor={p('notes')}>
        <Textarea
          id={p('notes')}
          name="notes"
          rows={2}
          maxLength={2000}
          defaultValue={client?.notes ?? ''}
        />
      </Field>
    </>
  )
}

export function ClientManager({ clients }: { clients: ClientRow[] }) {
  const [createState, createAction] = useActionState(createClientAction, null)
  const [archiveState, archiveAction] = useActionState(archiveClientAction, null)
  const [editState, editAction] = useActionState(updateClientAction, null)
  const [editing, setEditing] = useState<string | null>(null)
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
          className="tap flex items-center justify-center gap-2 btn-primary rounded-lg px-4 text-sm font-medium text-white sm:ml-auto"
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

            <ClientFields state={createState} />

            <SubmitButton pendingLabel="Saving…">Add client</SubmitButton>
          </form>
        </Panel>
      ) : null}

      {filtered.length === 0 ? (
        <Panel>
          <EmptyState
            title={query ? 'No clients match that search' : 'No clients yet'}
            description={
              query
                ? 'Try part of the company name or the TIN.'
                : 'Add the companies HA GROUP works for. Projects and documents hang off these records.'
            }
          />
        </Panel>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filtered.map((c, cardIndex) => (
            <div
              key={c.id}
              className="rise relative overflow-hidden rounded-xl border border-ink-200 bg-panel p-4 shadow-sm sm:p-5"
              style={{ '--i': cardIndex } as React.CSSProperties}
            >
              <span
                className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-brand-600/[0.07] to-transparent"
                aria-hidden="true"
              />
              <div className="relative flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-ink-900">{c.legalName}</p>
                    {c.status !== 'active' ? (
                      <Badge tone="neutral">
                        {c.status === 'archived' ? 'Archived' : 'Inactive'}
                      </Badge>
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

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing(editing === c.id ? null : c.id)}
                    className="tap flex items-center gap-1.5 rounded px-2 text-sm text-ink-700 hover:bg-ink-50"
                    aria-expanded={editing === c.id}
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                    {editing === c.id ? 'Cancel' : 'Edit'}
                  </button>

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
              </div>

              {editing === c.id ? (
                <form
                  action={editAction}
                  className="relative mt-4 w-full space-y-4 rounded-lg border border-ink-200 bg-ink-50 p-3.5"
                  noValidate
                >
                  <FormResult state={editState} />
                  <input type="hidden" name="clientId" value={c.id} />
                  <ClientFields state={editState} client={c} />
                  <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-ink-400">
        Clients are archived, never deleted — historical quotations and invoices must always resolve
        to a real counterparty.
      </p>
    </>
  )
}

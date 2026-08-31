'use client'

import { useActionState, useState } from 'react'
import { BellRing, FileCheck2, Plus } from 'lucide-react'
import { Badge, Field, Input, Notice, Panel, PanelHeader, Select, Textarea } from '@/components/ui'
import { errorsFor, FormResult, SubmitButton } from '@/components/form'
import { COMPLIANCE_STATUS, formatDate } from '@/lib/display'
import {
  createComplianceTypeAction,
  recordComplianceAction,
  runComplianceRemindersAction,
} from '@/server/compliance-actions'
import type { ComplianceRow } from '@/server/compliance-actions'

/**
 * The compliance board.
 *
 * Status is computed in the database from the expiry date, so what is shown
 * here is correct on the day it is read rather than on the day someone last
 * ran a job. The reminder sweep is idempotent and can be triggered by hand,
 * which also makes it testable without waiting for a cron schedule.
 */
export function ComplianceBoard({
  rows,
  types,
  people,
  canManage,
}: {
  rows: ComplianceRow[]
  types: Array<{ id: string; code: string; label: string }>
  people: Array<{ id: string; fullName: string }>
  canManage: boolean
}) {
  const [recordState, recordAction] = useActionState(recordComplianceAction, null)
  const [reminderState, reminderAction] = useActionState(
    async () => runComplianceRemindersAction(),
    null,
  )
  const [typeState, typeAction] = useActionState(createComplianceTypeAction, null)
  const [showForm, setShowForm] = useState(false)
  const [showTypeForm, setShowTypeForm] = useState(false)

  const expired = rows.filter((r) => r.status === 'expired')
  const soon = rows.filter((r) => r.status === 'expiring_soon' || r.status === 'renewal_pending')
  const missing = rows.filter((r) => r.status === 'unknown')
  const valid = rows.filter((r) => r.status === 'valid')

  return (
    <>
      <FormResult state={reminderState} />

      <div className="flex flex-wrap gap-2">
        {canManage ? (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="tap inline-flex items-center gap-2 btn-primary rounded-lg px-4 text-sm font-medium text-white"
          >
            <Plus className="size-4" aria-hidden="true" />
            {showForm ? 'Close' : 'Record a certificate'}
          </button>
        ) : null}

        {canManage ? (
          <button
            type="button"
            onClick={() => setShowTypeForm((v) => !v)}
            className="tap inline-flex items-center gap-2 rounded border border-ink-300 bg-panel px-4 text-sm font-medium text-ink-800 hover:bg-ink-50"
          >
            <Plus className="size-4" aria-hidden="true" />
            {showTypeForm ? 'Close' : 'Add a certificate type'}
          </button>
        ) : null}

        <form action={reminderAction}>
          <SubmitButton variant="secondary" pendingLabel="Checking…">
            <BellRing className="size-4" aria-hidden="true" />
            Send due reminders
          </SubmitButton>
        </form>
      </div>

      {expired.length > 0 ? (
        <Notice tone="risk" title={`${expired.length} certificate(s) have expired`}>
          Trading without these may breach contract terms or the law. Renew and record the new
          certificate.
        </Notice>
      ) : null}

      {showTypeForm && canManage ? (
        <Panel>
          <PanelHeader
            title="New certificate type"
            description="The kinds of certificate HA GROUP has to keep current — a licence, a registration, a tax clearance."
          />
          <form action={typeAction} className="space-y-4 p-4 sm:p-5" noValidate>
            <FormResult state={typeState} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Code" htmlFor="code" required errors={errorsFor(typeState, 'code')}>
                <Input id="code" name="code" required maxLength={40} placeholder="TIN" />
              </Field>
              <Field label="Label" htmlFor="label" required errors={errorsFor(typeState, 'label')}>
                <Input
                  id="label"
                  name="label"
                  required
                  maxLength={160}
                  placeholder="Taxpayer Identification Number"
                />
              </Field>
              <Field label="Issuing authority" htmlFor="authority">
                <Input id="authority" name="authority" maxLength={120} placeholder="TRA" />
              </Field>
              <Field
                label="Normal validity (months)"
                htmlFor="defaultValidityMonths"
                hint="Leave blank if it does not expire on a fixed cycle."
                errors={errorsFor(typeState, 'defaultValidityMonths')}
              >
                <Input
                  id="defaultValidityMonths"
                  name="defaultValidityMonths"
                  type="number"
                  min={1}
                  max={240}
                />
              </Field>
            </div>

            <Field
              label="Remind at"
              htmlFor="reminderDays"
              hint="Days before expiry, comma separated."
              errors={errorsFor(typeState, 'reminderDays')}
            >
              <Input id="reminderDays" name="reminderDays" defaultValue="90,30,14,7,1,0" />
            </Field>

            <Field label="Description" htmlFor="description">
              <Textarea id="description" name="description" rows={2} maxLength={1000} />
            </Field>

            <SubmitButton pendingLabel="Adding…">Add type</SubmitButton>
          </form>
        </Panel>
      ) : null}

      {showForm && canManage ? (
        <Panel>
          <PanelHeader
            title="Record a certificate"
            description="Recording a new one supersedes the current record — the old one is kept, so past cover stays provable."
          />
          <form action={recordAction} className="space-y-4 p-4 sm:p-5" noValidate>
            <FormResult state={recordState} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Certificate type"
                htmlFor="complianceTypeId"
                required
                errors={errorsFor(recordState, 'complianceTypeId')}
              >
                <Select id="complianceTypeId" name="complianceTypeId" required>
                  <option value="">Choose…</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Certificate number" htmlFor="referenceNumber">
                <Input id="referenceNumber" name="referenceNumber" maxLength={120} />
              </Field>

              <Field
                label="Issued on"
                htmlFor="issuedOn"
                errors={errorsFor(recordState, 'issuedOn')}
              >
                <Input id="issuedOn" name="issuedOn" type="date" />
              </Field>

              <Field
                label="Expires on"
                htmlFor="expiresOn"
                required
                errors={errorsFor(recordState, 'expiresOn')}
              >
                <Input id="expiresOn" name="expiresOn" type="date" required />
              </Field>

              <Field label="Responsible person" htmlFor="responsibleUserId">
                <Select id="responsibleUserId" name="responsibleUserId">
                  <option value="">Nobody assigned</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Certificate file"
                htmlFor="certificate"
                errors={errorsFor(recordState, 'certificate')}
              >
                <input
                  id="certificate"
                  name="certificate"
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  className="tap w-full rounded border border-ink-300 bg-panel px-3 text-sm"
                />
              </Field>
            </div>

            <Field label="Notes" htmlFor="notes">
              <Textarea id="notes" name="notes" rows={2} maxLength={2000} />
            </Field>

            <SubmitButton pendingLabel="Saving…">Record certificate</SubmitButton>
          </form>
        </Panel>
      ) : null}

      {expired.length > 0 ? <Group title="Expired" rows={expired} /> : null}
      {soon.length > 0 ? <Group title="Expiring soon" rows={soon} /> : null}
      {missing.length > 0 ? <Group title="Not yet recorded" rows={missing} /> : null}
      {valid.length > 0 ? <Group title="Current" rows={valid} /> : null}
    </>
  )
}

function Group({ title, rows }: { title: string; rows: ComplianceRow[] }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h2 className="text-xs font-semibold tracking-wider text-ink-500 uppercase">{title}</h2>
        <span className="text-xs text-ink-400 tabular">{rows.length}</span>
      </div>

      <Panel className="divide-y divide-ink-100">
        {rows.map((row) => {
          const meta = COMPLIANCE_STATUS[row.status] ?? {
            label: row.status,
            tone: 'neutral' as const,
          }
          return (
            <div key={`${row.code}-${row.id}`} className="px-4 py-3.5 sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-ink-900">{row.label}</p>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    {row.hasDocument ? (
                      <FileCheck2 className="size-4 text-ok-600" aria-label="Certificate on file" />
                    ) : null}
                  </div>

                  <p className="mt-0.5 text-sm text-ink-500">
                    {row.authority ?? '—'}
                    {row.referenceNumber ? ` · ${row.referenceNumber}` : ''}
                  </p>

                  <p className="mt-1 text-xs text-ink-400">
                    {row.expiresOn ? (
                      <>
                        Expires {formatDate(row.expiresOn)}
                        {row.daysRemaining != null ? (
                          <span
                            className={
                              row.daysRemaining < 0
                                ? 'text-risk-600'
                                : row.daysRemaining <= 30
                                  ? 'text-warn-700'
                                  : ''
                            }
                          >
                            {' '}
                            ·{' '}
                            {row.daysRemaining < 0
                              ? `${Math.abs(row.daysRemaining)} day(s) overdue`
                              : `${row.daysRemaining} day(s) remaining`}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      'No certificate recorded'
                    )}
                    {row.responsibleName ? ` · ${row.responsibleName}` : ''}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </Panel>
    </section>
  )
}

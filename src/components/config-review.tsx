'use client'

import { useActionState, useState } from 'react'
import { Check, Info, X } from 'lucide-react'
import { Badge, EmptyState, Field, Panel, PanelHeader, Textarea } from '@/components/ui'
import { errorsFor, FormResult, SubmitButton } from '@/components/form'
import { CONFIG_STATE, DOCUMENT_TYPE_LABELS, formatDate } from '@/lib/display'
import { decideConfigAction, withdrawConfigAction } from '@/server/config-actions'

export interface ConfigRecord {
  table_name: string
  id: string
  state: string
  notes: string | null
  created_at: string
  approved_at: string | null
  summary: string
  detail: string | null
}

const GROUP_LABELS: Record<string, string> = {
  legal_entities: 'Legal entity',
  entity_addresses: 'Addresses',
  bank_accounts: 'Bank accounts',
  numbering_rules: 'Document numbering',
  charge_rules: 'Charges',
  tax_rules: 'Tax rates',
  rounding_policies: 'Rounding policy',
  approval_policies: 'Approval policy',
  brand_profiles: 'Brand Profile',
}

const GROUP_ORDER = [
  'legal_entities',
  'entity_addresses',
  'bank_accounts',
  'numbering_rules',
  'charge_rules',
  'tax_rules',
  'rounding_policies',
  'approval_policies',
  'brand_profiles',
]

/** Enum values print as human labels where one exists. */
function prettySummary(table: string, summary: string): string {
  if (table === 'numbering_rules' || table === 'approval_policies') {
    return DOCUMENT_TYPE_LABELS[summary] ?? summary
  }
  return summary
}

export function ConfigReview({ records }: { records: ConfigRecord[] }) {
  const [decideState, decideAction] = useActionState(decideConfigAction, null)
  const [withdrawState, withdrawAction] = useActionState(withdrawConfigAction, null)
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [withdrawing, setWithdrawing] = useState<string | null>(null)
  const [showSuperseded, setShowSuperseded] = useState(false)

  const visible = showSuperseded
    ? records
    : records.filter((r) => r.state !== 'superseded' && r.state !== 'rejected')

  return (
    <>
      <FormResult state={decideState} />
      <FormResult state={withdrawState} />

      <label className="flex items-center gap-2 text-sm text-ink-600">
        <input
          type="checkbox"
          checked={showSuperseded}
          onChange={(e) => setShowSuperseded(e.target.checked)}
          className="size-4 accent-brand-600"
        />
        Show rejected and superseded versions
      </label>

      {GROUP_ORDER.map((group) => {
        const rows = visible.filter((r) => r.table_name === group)
        if (rows.length === 0) return null

        return (
          <Panel key={group}>
            <PanelHeader
              title={GROUP_LABELS[group] ?? group}
              action={
                rows.some((r) => r.state === 'draft') ? (
                  <Badge tone="warn">
                    {rows.filter((r) => r.state === 'draft').length} to review
                  </Badge>
                ) : null
              }
            />

            <div className="divide-y divide-ink-100">
              {rows.map((r) => {
                const state = CONFIG_STATE[r.state] ?? { label: r.state, tone: 'neutral' as const }
                const key = `${r.table_name}:${r.id}`

                return (
                  <div key={r.id} className="px-4 py-3.5 sm:px-5">
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-ink-900">
                            {prettySummary(r.table_name, r.summary)}
                          </p>
                          <Badge tone={state.tone}>{state.label}</Badge>
                        </div>

                        {r.detail ? (
                          <p className="mt-0.5 text-sm text-ink-600">{r.detail}</p>
                        ) : null}

                        {r.notes ? (
                          <p className="mt-2 flex gap-1.5 rounded border border-ink-200 bg-ink-50 px-2.5 py-1.5 text-xs text-ink-600">
                            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                            <span>{r.notes}</span>
                          </p>
                        ) : null}

                        <p className="mt-1.5 text-xs text-ink-400">
                          {r.approved_at
                            ? `In effect since ${formatDate(r.approved_at)}`
                            : `Drafted ${formatDate(r.created_at)}`}
                        </p>
                      </div>

                      {r.state === 'draft' || r.state === 'pending_approval' ? (
                        <div className="flex gap-2">
                          <form action={decideAction}>
                            <input type="hidden" name="table" value={r.table_name} />
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="decision" value="approve" />
                            <SubmitButton size="sm" pendingLabel="Approving…">
                              <Check className="size-4" aria-hidden="true" />
                              Approve
                            </SubmitButton>
                          </form>
                          <button
                            type="button"
                            onClick={() => setRejecting(rejecting === key ? null : key)}
                            className="flex h-9 items-center gap-1.5 rounded border border-ink-300 bg-panel px-3 text-sm text-ink-700 hover:bg-ink-50"
                          >
                            <X className="size-4" aria-hidden="true" />
                            Reject
                          </button>
                        </div>
                      ) : null}

                      {r.state === 'approved' ? (
                        <button
                          type="button"
                          onClick={() => setWithdrawing(withdrawing === key ? null : key)}
                          className="flex h-9 items-center rounded px-3 text-sm text-ink-500 hover:bg-ink-50 hover:text-ink-800"
                        >
                          Withdraw
                        </button>
                      ) : null}
                    </div>

                    {rejecting === key ? (
                      <form
                        action={decideAction}
                        className="mt-3 space-y-2 rounded border border-risk-600/25 bg-risk-50 p-3"
                      >
                        <input type="hidden" name="table" value={r.table_name} />
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="decision" value="reject" />
                        <Field
                          label="Why is this being rejected?"
                          htmlFor={`reject-${r.id}`}
                          required
                          errors={errorsFor(decideState, 'comment')}
                        >
                          <Textarea id={`reject-${r.id}`} name="comment" rows={2} required />
                        </Field>
                        <SubmitButton variant="danger" size="sm" pendingLabel="Rejecting…">
                          Reject this setting
                        </SubmitButton>
                      </form>
                    ) : null}

                    {withdrawing === key ? (
                      <form
                        action={withdrawAction}
                        className="mt-3 space-y-2 rounded border border-warn-600/25 bg-warn-50 p-3"
                      >
                        <input type="hidden" name="table" value={r.table_name} />
                        <input type="hidden" name="id" value={r.id} />
                        <Field
                          label="Why is this being withdrawn?"
                          htmlFor={`withdraw-${r.id}`}
                          hint="It stops being in effect. Nothing replaces it until you approve another."
                          required
                          errors={errorsFor(withdrawState, 'reason')}
                        >
                          <Textarea id={`withdraw-${r.id}`} name="reason" rows={2} required />
                        </Field>
                        <SubmitButton variant="secondary" size="sm" pendingLabel="Withdrawing…">
                          Withdraw
                        </SubmitButton>
                      </form>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </Panel>
        )
      })}

      {visible.length === 0 ? (
        <Panel>
          <EmptyState
            title="No settings recorded"
            description="Run the seed script to load the Phase 0 observations as drafts."
          />
        </Panel>
      ) : null}
    </>
  )
}

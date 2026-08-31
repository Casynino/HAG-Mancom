'use client'

import { useActionState, useState } from 'react'
import { Plus } from 'lucide-react'
import { Field, Input, Notice, Panel, PanelHeader, Select, Textarea } from '@/components/ui'
import { errorsFor, FormResult, SubmitButton } from '@/components/form'
import { DOCUMENT_TYPE_LABELS } from '@/lib/display'
import { createConfigDraftAction } from '@/server/config-actions'

/**
 * Creating a configuration draft.
 *
 * Nothing written here takes effect. Every record is inserted in the `draft`
 * state and has to be approved on the same screen before the finance engine
 * will load it. That is the whole point: the 18% VAT rate and the 20%
 * administration charge are values HA GROUP controls here, never constants
 * compiled into the platform.
 *
 * Only the tables the server can actually insert are offered. Brand Profiles,
 * addresses and client vendor identities are created by their own flows, so
 * listing them here would be a control that does nothing.
 */

const CREATABLE = [
  { table: 'legal_entities', label: 'Legal entity' },
  { table: 'bank_accounts', label: 'Bank account' },
  { table: 'numbering_rules', label: 'Numbering rule' },
  { table: 'charge_rules', label: 'Charge (e.g. administration)' },
  { table: 'tax_rules', label: 'Tax rate (e.g. VAT)' },
  { table: 'rounding_policies', label: 'Rounding policy' },
  { table: 'approval_policies', label: 'Approval policy' },
] as const

type Table = (typeof CREATABLE)[number]['table']

const DOC_TYPES = Object.entries(DOCUMENT_TYPE_LABELS)

export function ConfigDraftForm({
  legalEntities,
}: {
  legalEntities: Array<{ id: string; name: string; state: string }>
}) {
  const [state, action] = useActionState(createConfigDraftAction, null)
  const [open, setOpen] = useState(false)
  const [table, setTable] = useState<Table>('tax_rules')

  const err = (name: string) => errorsFor(state, name)

  return (
    <Panel>
      <PanelHeader
        title="Add a setting"
        description="Saved as a draft. It has no effect until approved below."
        action={
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="tap flex items-center gap-2 btn-primary rounded-lg px-3 text-sm font-medium text-white"
          >
            <Plus className="size-4" aria-hidden="true" />
            {open ? 'Close' : 'New setting'}
          </button>
        }
      />

      {open ? (
        <form action={action} className="space-y-4 p-4 sm:p-5" noValidate>
          <FormResult state={state} />

          <Field label="What are you adding?" htmlFor="table" required>
            <Select
              id="table"
              name="table"
              value={table}
              onChange={(e) => setTable(e.target.value as Table)}
            >
              {CREATABLE.map((c) => (
                <option key={c.table} value={c.table}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>

          {table === 'legal_entities' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Entity name" htmlFor="name" required errors={err('name')}>
                <Input id="name" name="name" required maxLength={200} />
              </Field>
              <Field
                label="Suffix"
                htmlFor="entitySuffix"
                hint="e.g. LTD — kept separate so it can be rendered consistently."
              >
                <Input id="entitySuffix" name="entitySuffix" maxLength={40} />
              </Field>
              <Field
                label="Country code"
                htmlFor="countryCode"
                required
                errors={err('countryCode')}
              >
                <Input
                  id="countryCode"
                  name="countryCode"
                  defaultValue="TZ"
                  maxLength={2}
                  required
                />
              </Field>
              <Field label="Registration number" htmlFor="registrationNumber">
                <Input id="registrationNumber" name="registrationNumber" maxLength={60} />
              </Field>
              <Field label="TIN" htmlFor="tin">
                <Input id="tin" name="tin" maxLength={30} />
              </Field>
              <Field label="VRN" htmlFor="vrn">
                <Input id="vrn" name="vrn" maxLength={30} />
              </Field>
              <Field label="Business licence" htmlFor="businessLicence">
                <Input id="businessLicence" name="businessLicence" maxLength={60} />
              </Field>
              <Field label="Import/export licence" htmlFor="importExportLicence">
                <Input id="importExportLicence" name="importExportLicence" maxLength={60} />
              </Field>
            </div>
          ) : null}

          {table === 'bank_accounts' ? (
            legalEntities.length === 0 ? (
              <Notice tone="warn">
                Add and approve a legal entity first — a bank account has to belong to one.
              </Notice>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Legal entity"
                  htmlFor="legalEntityId"
                  required
                  errors={err('legalEntityId')}
                >
                  <Select id="legalEntityId" name="legalEntityId" required>
                    {legalEntities.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                        {e.state === 'approved' ? '' : ` (${e.state})`}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Currency" htmlFor="currency" required errors={err('currency')}>
                  <Input id="currency" name="currency" defaultValue="TZS" maxLength={3} required />
                </Field>
                <Field
                  label="Account name"
                  htmlFor="accountName"
                  required
                  errors={err('accountName')}
                >
                  <Input id="accountName" name="accountName" required maxLength={200} />
                </Field>
                <Field label="Bank name" htmlFor="bankName" required errors={err('bankName')}>
                  <Input id="bankName" name="bankName" required maxLength={200} />
                </Field>
                <Field
                  label="Account number"
                  htmlFor="accountNumber"
                  required
                  errors={err('accountNumber')}
                >
                  <Input id="accountNumber" name="accountNumber" required maxLength={60} />
                </Field>
                <Field label="Branch" htmlFor="branch">
                  <Input id="branch" name="branch" maxLength={120} />
                </Field>
                <Field label="SWIFT code" htmlFor="swiftCode">
                  <Input id="swiftCode" name="swiftCode" maxLength={20} />
                </Field>
                <Field label="Sort code" htmlFor="sortCode">
                  <Input id="sortCode" name="sortCode" maxLength={20} />
                </Field>
              </div>
            )
          ) : null}

          {table === 'numbering_rules' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Document type"
                htmlFor="documentType"
                required
                errors={err('documentType')}
              >
                <Select id="documentType" name="documentType" required>
                  {DOC_TYPES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Pattern"
                htmlFor="pattern"
                required
                hint="Must contain {SEQ}. {YYYY} and {MM} are also substituted."
                errors={err('pattern')}
              >
                <Input id="pattern" name="pattern" required placeholder="{PREFIX}{SEQ}" />
              </Field>
              <Field label="Prefix" htmlFor="prefix" required errors={err('prefix')}>
                <Input id="prefix" name="prefix" required maxLength={20} />
              </Field>
              <Field
                label="Digits"
                htmlFor="sequencePadding"
                required
                errors={err('sequencePadding')}
              >
                <Input
                  id="sequencePadding"
                  name="sequencePadding"
                  type="number"
                  min={1}
                  max={12}
                  defaultValue={4}
                  required
                />
              </Field>
              <Field
                label="Start at"
                htmlFor="sequenceStart"
                required
                errors={err('sequenceStart')}
              >
                <Input
                  id="sequenceStart"
                  name="sequenceStart"
                  type="number"
                  min={1}
                  defaultValue={1}
                  required
                />
              </Field>
              <Field label="Reset" htmlFor="resetPeriod" required>
                <Select id="resetPeriod" name="resetPeriod" defaultValue="never">
                  <option value="never">Never</option>
                  <option value="yearly">Every year</option>
                  <option value="monthly">Every month</option>
                </Select>
              </Field>
            </div>
          ) : null}

          {table === 'charge_rules' || table === 'tax_rules' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Code" htmlFor="code" required errors={err('code')}>
                <Input
                  id="code"
                  name="code"
                  required
                  maxLength={30}
                  placeholder={table === 'tax_rules' ? 'VAT' : 'ADMIN'}
                />
              </Field>
              <Field label="Label" htmlFor="label" required errors={err('label')}>
                <Input
                  id="label"
                  name="label"
                  required
                  maxLength={120}
                  placeholder={table === 'tax_rules' ? 'Value Added Tax' : 'Administration'}
                />
              </Field>
              <Field
                label="Rate %"
                htmlFor="ratePercent"
                required
                hint="The percentage itself — 18 means 18%."
                errors={err('ratePercent')}
              >
                <Input
                  id="ratePercent"
                  name="ratePercent"
                  type="number"
                  step="0.00001"
                  min={0}
                  max={100}
                  required
                />
              </Field>
              <Field
                label="Applies to"
                htmlFor="documentType"
                hint="Leave blank to apply to every document type."
              >
                <Select id="documentType" name="documentType" defaultValue="">
                  <option value="">All document types</option>
                  {DOC_TYPES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>

              {table === 'charge_rules' ? (
                <>
                  <Field
                    label="Position"
                    htmlFor="position"
                    required
                    hint="Charges are applied in ascending order."
                    errors={err('position')}
                  >
                    <Input
                      id="position"
                      name="position"
                      type="number"
                      min={0}
                      max={100}
                      defaultValue={0}
                      required
                    />
                  </Field>
                  <label className="tap flex items-center gap-2 self-end text-sm text-ink-700">
                    <input
                      type="checkbox"
                      name="appliesBeforeVat"
                      defaultChecked
                      className="size-4 accent-brand-600"
                    />
                    Applied before VAT is calculated
                  </label>
                </>
              ) : null}
            </div>
          ) : null}

          {table === 'rounding_policies' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Scope" htmlFor="scope" required errors={err('scope')}>
                <Input id="scope" name="scope" defaultValue="default" required maxLength={60} />
              </Field>
              <Field label="Currency" htmlFor="currency" required errors={err('currency')}>
                <Input id="currency" name="currency" defaultValue="TZS" maxLength={3} required />
              </Field>
              <Field
                label="Decimal places"
                htmlFor="decimalPlaces"
                required
                errors={err('decimalPlaces')}
              >
                <Input
                  id="decimalPlaces"
                  name="decimalPlaces"
                  type="number"
                  min={0}
                  max={6}
                  defaultValue={2}
                  required
                />
              </Field>
              <Field label="Mode" htmlFor="mode" required>
                <Select id="mode" name="mode" defaultValue="half_up">
                  <option value="half_up">Half up</option>
                  <option value="half_even">Half even (banker&rsquo;s)</option>
                  <option value="half_down">Half down</option>
                  <option value="floor">Floor</option>
                  <option value="ceil">Ceiling</option>
                </Select>
              </Field>
              <Field
                label="Round at"
                htmlFor="roundAtStep"
                required
                hint="Where in the calculation rounding happens."
              >
                <Select id="roundAtStep" name="roundAtStep" defaultValue="line_total">
                  <option value="unit_price">Unit price</option>
                  <option value="line_total">Line total</option>
                  <option value="subtotal">Subtotal</option>
                  <option value="grand_total">Grand total</option>
                </Select>
              </Field>
            </div>
          ) : null}

          {table === 'approval_policies' ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Document type"
                  htmlFor="documentType"
                  required
                  errors={err('documentType')}
                >
                  <Select id="documentType" name="documentType" required>
                    {DOC_TYPES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Delegation currency" htmlFor="delegationCurrency" required>
                  <Input
                    id="delegationCurrency"
                    name="delegationCurrency"
                    defaultValue="TZS"
                    maxLength={3}
                    required
                  />
                </Field>
                <Field
                  label="Delegation ceiling"
                  htmlFor="delegationMaxValue"
                  hint="Above this value a Technical Officer may not approve, even when delegation is on."
                >
                  <Input id="delegationMaxValue" name="delegationMaxValue" inputMode="decimal" />
                </Field>
              </div>

              <fieldset className="space-y-2 rounded border border-ink-200 p-3">
                <legend className="px-1 text-xs font-medium text-ink-700">Who approves</legend>
                <label className="tap flex items-center gap-2 text-sm text-ink-700">
                  <input
                    type="checkbox"
                    name="requiresDirectorApproval"
                    defaultChecked
                    className="size-4 accent-brand-600"
                  />
                  A Director must approve
                </label>
                <label className="tap flex items-center gap-2 text-sm text-ink-700">
                  <input
                    type="checkbox"
                    name="technicalOfficerMayApprove"
                    className="size-4 accent-brand-600"
                  />
                  Delegate to the Technical Officer
                </label>
                <label className="tap flex items-center gap-2 text-sm text-ink-700">
                  <input
                    type="checkbox"
                    name="delegationUrgentOnly"
                    className="size-4 accent-brand-600"
                  />
                  Delegation applies only to urgent work
                </label>
                <p className="text-xs text-ink-500">
                  These two cannot both be on. Turn off the Director requirement to delegate.
                </p>
                {(err('technicalOfficerMayApprove') ?? []).map((m) => (
                  <p key={m} className="text-xs text-risk-600">
                    {m}
                  </p>
                ))}
              </fieldset>

              <fieldset className="space-y-2 rounded border border-ink-200 p-3">
                <legend className="px-1 text-xs font-medium text-ink-700">
                  What must be applied
                </legend>
                <label className="tap flex items-center gap-2 text-sm text-ink-700">
                  <input
                    type="checkbox"
                    name="requiresSignature"
                    defaultChecked
                    className="size-4 accent-brand-600"
                  />
                  Director&rsquo;s signature required
                </label>
                <label className="tap flex items-center gap-2 text-sm text-ink-700">
                  <input type="checkbox" name="requiresStamp" className="size-4 accent-brand-600" />
                  Company stamp required
                </label>
              </fieldset>
            </div>
          ) : null}

          <Field
            label="Note"
            htmlFor="notes"
            hint="Where this value came from. The approver will read it."
          >
            <Textarea id="notes" name="notes" rows={2} maxLength={2000} />
          </Field>

          <SubmitButton pendingLabel="Saving…">Save as draft</SubmitButton>
        </form>
      ) : null}
    </Panel>
  )
}

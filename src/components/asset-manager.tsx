'use client'

import { useActionState, useState } from 'react'
import { ArrowDown, ArrowUp, Check, PenLine, Stamp, Upload, X } from 'lucide-react'
import { Badge, EmptyState, Field, Input, Notice, Panel, PanelHeader, Select, Textarea } from '@/components/ui'
import { errorsFor, FormResult, SubmitButton } from '@/components/form'
import { CONFIG_STATE, formatBytes, formatDate } from '@/lib/display'
import {
  decideAssetAction,
  reorderPartnerMarksAction,
  uploadCompanyAssetAction,
} from '@/server/asset-actions'

interface AssetRow {
  id: string
  kind: string
  label: string
  state: string
  displayOrder: number
  isDefault: boolean
  isSensitive: boolean
  contentType: string
  byteSize: number
  createdAt: string
  approvedAt: string | null
  ownerUserId: string | null
  ownerName: string | null
}

const KIND_LABELS: Record<string, string> = {
  logo: 'Company logo',
  partner_mark: 'Partner / OEM mark',
  stamp: 'Company stamp',
  signature: 'Signature',
  letterhead: 'Letterhead',
}

const KIND_ORDER = ['logo', 'partner_mark', 'stamp', 'signature', 'letterhead']

export function AssetManager({
  assets,
  isAdmin,
  canUploadSignature,
  actorId,
}: {
  assets: AssetRow[]
  isAdmin: boolean
  canUploadSignature: boolean
  actorId: string
}) {
  const [uploadState, uploadAction] = useActionState(uploadCompanyAssetAction, null)
  const [decideState, decideAction] = useActionState(decideAssetAction, null)
  const [orderState, orderAction] = useActionState(reorderPartnerMarksAction, null)
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [showUpload, setShowUpload] = useState(false)

  // A Director who is not an Administrator may upload one thing: their own
  // signature. The select reflects that rather than offering options that
  // would be refused server-side.
  const availableKinds = isAdmin
    ? KIND_ORDER
    : canUploadSignature
      ? ['signature']
      : []

  return (
    <>
      <FormResult state={decideState} />

      {availableKinds.length > 0 ? (
        <button
          type="button"
          onClick={() => setShowUpload((v) => !v)}
          className="tap inline-flex items-center gap-2 rounded bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 sm:self-start"
        >
          <Upload className="size-4" aria-hidden="true" />
          {showUpload ? 'Close' : isAdmin ? 'Upload an asset' : 'Upload my signature'}
        </button>
      ) : null}

      {showUpload ? (
        <Panel>
          <PanelHeader
            title="Upload"
            description="Uploads arrive as drafts. Nothing prints on a document until it is approved."
          />
          <form action={uploadAction} className="space-y-4 p-4 sm:p-5" noValidate>
            <FormResult state={uploadState} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Kind" htmlFor="kind" required errors={errorsFor(uploadState, 'kind')}>
                <Select id="kind" name="kind" required defaultValue={availableKinds[0]}>
                  {availableKinds.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABELS[k]}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Name" htmlFor="label" required errors={errorsFor(uploadState, 'label')}>
                <Input
                  id="label"
                  name="label"
                  required
                  maxLength={160}
                  placeholder="e.g. SEW-EURODRIVE, or Company stamp"
                />
              </Field>

              <Field
                label="Display order"
                htmlFor="displayOrder"
                hint="Partner marks print left to right in this order."
              >
                <Input id="displayOrder" name="displayOrder" type="number" min={0} defaultValue={0} />
              </Field>

              <Field
                label="File"
                htmlFor="file"
                hint="PNG with a transparent background for a stamp or signature."
                required
                errors={errorsFor(uploadState, 'file')}
              >
                <input
                  id="file"
                  name="file"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  required
                  className="tap w-full rounded border border-ink-300 bg-panel px-3 text-sm"
                />
              </Field>
            </div>

            <Notice tone="neutral">
              A signature is bound to whoever uploads it and can only ever be applied by that
              person. An Administrator can approve one for use, but cannot upload one for someone
              else.
            </Notice>

            <SubmitButton pendingLabel="Uploading…">Upload</SubmitButton>
          </form>
        </Panel>
      ) : null}

      {assets.length === 0 ? (
        <Panel>
          <EmptyState
            title="No brand assets yet"
            description="Upload the HA GROUP logo, the four OEM partner marks, the company stamp, and each Director's signature."
          />
        </Panel>
      ) : null}

      {KIND_ORDER.map((kind) => {
        const rows = assets.filter((a) => a.kind === kind)
        if (rows.length === 0) return null

        // Partner marks print as a row along the footer, so the order they are
        // stored in is the order the client sees.
        const orderable = kind === 'partner_mark' && isAdmin && rows.length > 1

        function moveTo(index: number, delta: number): string[] {
          const ids = rows.map((r) => r.id)
          const target = index + delta
          if (target < 0 || target >= ids.length) return ids
          const next = [...ids]
          const [moved] = next.splice(index, 1)
          next.splice(target, 0, moved!)
          return next
        }

        return (
          <Panel key={kind}>
            <PanelHeader
              title={KIND_LABELS[kind] ?? kind}
              description={
                orderable ? 'Printed left to right in this order.' : undefined
              }
              action={
                rows.some((r) => r.state === 'draft') ? (
                  <Badge tone="warn">{rows.filter((r) => r.state === 'draft').length} to review</Badge>
                ) : null
              }
            />
            {orderable ? (
              <div className="px-4 pt-3 sm:px-5">
                <FormResult state={orderState} />
              </div>
            ) : null}
            <div className="divide-y divide-ink-100">
              {rows.map((asset) => {
                const state = CONFIG_STATE[asset.state] ?? {
                  label: asset.state,
                  tone: 'neutral' as const,
                }
                const mine = asset.ownerUserId === actorId
                // A signature belongs to one person; nobody else previews it.
                const viewable = !asset.isSensitive || mine || isAdmin

                return (
                  <div key={asset.id} className="px-4 py-3.5 sm:px-5">
                    <div className="flex flex-wrap items-start gap-3">
                      {viewable && asset.state !== 'rejected' ? (
                        <img
                          src={`/api/assets/${asset.id}`}
                          alt={asset.label}
                          className="h-12 w-24 shrink-0 rounded border border-ink-200 bg-panel object-contain p-1"
                        />
                      ) : (
                        <div className="flex h-12 w-24 shrink-0 items-center justify-center rounded border border-dashed border-ink-300 text-ink-400">
                          {asset.kind === 'signature' ? (
                            <PenLine className="size-4" aria-hidden="true" />
                          ) : (
                            <Stamp className="size-4" aria-hidden="true" />
                          )}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-ink-900">{asset.label}</p>
                          <Badge tone={state.tone}>{state.label}</Badge>
                          {asset.isDefault ? <Badge tone="brand">Default</Badge> : null}
                          {mine ? <Badge tone="neutral">Yours</Badge> : null}
                        </div>

                        <p className="mt-0.5 text-sm text-ink-500">
                          {asset.ownerName ? `${asset.ownerName} · ` : ''}
                          {asset.contentType} · {formatBytes(asset.byteSize)}
                        </p>

                        <p className="mt-1 text-xs text-ink-400">
                          {asset.approvedAt
                            ? `In use since ${formatDate(asset.approvedAt)}`
                            : `Uploaded ${formatDate(asset.createdAt)}`}
                        </p>
                      </div>

                      {orderable ? (
                        <div className="flex items-center gap-1">
                          {[-1, 1].map((delta) => {
                            const index = rows.findIndex((r) => r.id === asset.id)
                            const disabled =
                              delta === -1 ? index === 0 : index === rows.length - 1
                            return (
                              <form key={delta} action={orderAction}>
                                <input
                                  type="hidden"
                                  name="order"
                                  value={JSON.stringify(moveTo(index, delta))}
                                />
                                <SubmitButton
                                  variant="ghost"
                                  size="sm"
                                  pendingLabel="…"
                                  disabled={disabled}
                                >
                                  {delta === -1 ? (
                                    <ArrowUp className="size-4" aria-hidden="true" />
                                  ) : (
                                    <ArrowDown className="size-4" aria-hidden="true" />
                                  )}
                                  <span className="sr-only">
                                    Move {asset.label} {delta === -1 ? 'earlier' : 'later'}
                                  </span>
                                </SubmitButton>
                              </form>
                            )
                          })}
                        </div>
                      ) : null}

                      {isAdmin && asset.state === 'draft' ? (
                        <div className="flex gap-2">
                          <form action={decideAction}>
                            <input type="hidden" name="assetId" value={asset.id} />
                            <input type="hidden" name="decision" value="approve" />
                            <SubmitButton size="sm" pendingLabel="Approving…">
                              <Check className="size-4" aria-hidden="true" />
                              Approve
                            </SubmitButton>
                          </form>
                          <button
                            type="button"
                            onClick={() => setRejecting(rejecting === asset.id ? null : asset.id)}
                            className="flex h-9 items-center gap-1.5 rounded border border-ink-300 bg-panel px-3 text-sm text-ink-700 hover:bg-ink-50"
                          >
                            <X className="size-4" aria-hidden="true" />
                            Reject
                          </button>
                        </div>
                      ) : null}
                    </div>

                    {rejecting === asset.id ? (
                      <form
                        action={decideAction}
                        className="mt-3 space-y-2 rounded border border-risk-600/25 bg-risk-50 p-3"
                      >
                        <input type="hidden" name="assetId" value={asset.id} />
                        <input type="hidden" name="decision" value="reject" />
                        <Field
                          label="Why?"
                          htmlFor={`reject-${asset.id}`}
                          required
                          errors={errorsFor(decideState, 'comment')}
                        >
                          <Textarea id={`reject-${asset.id}`} name="comment" rows={2} required />
                        </Field>
                        <SubmitButton variant="danger" size="sm" pendingLabel="Rejecting…">
                          Reject
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
    </>
  )
}

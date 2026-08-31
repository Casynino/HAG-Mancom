'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { Camera, Check, Eraser, PenLine } from 'lucide-react'
import { Badge, Notice, Panel, PanelHeader } from '@/components/ui'
import { FormResult, SubmitButton } from '@/components/form'
import { formatDateTime } from '@/lib/display'
import { addDeliveryPhotoAction, signDeliveryAction } from '@/server/operations-actions'

/**
 * Signature capture at handover.
 *
 * A finger-drawn signature on a canvas, taken on site on a phone. This is
 * deliberately NOT the Director's official signature asset — that lives in
 * company_assets, can only be applied by the Director it belongs to, and never
 * touches this screen. This is the ordinary "sign here on delivery" mark.
 *
 * The canvas is exported as a PNG and posted as a file, so the stored artefact
 * is an ordinary image that goes through the same validation as any upload.
 */

function SignaturePad({
  onChange,
  disabled,
}: {
  onChange: (blob: Blob | null) => void
  disabled?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [hasInk, setHasInk] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Match the backing store to the device pixel ratio, or the line looks
    // soft and the exported PNG is low-resolution.
    const ratio = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * ratio
    canvas.height = rect.height * ratio

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#10131a'
  }, [])

  function pointFrom(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = pointFrom(event)
    ctx.beginPath()
    ctx.moveTo(x, y)
    drawing.current = true
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || disabled) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = pointFrom(event)
    ctx.lineTo(x, y)
    ctx.stroke()
    setHasInk(true)
  }

  function end() {
    if (!drawing.current) return
    drawing.current = false
    canvasRef.current?.toBlob((blob) => onChange(blob), 'image/png')
  }

  function clear() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
    onChange(null)
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="h-40 w-full touch-none rounded border-2 border-dashed border-ink-300 bg-white"
        aria-label="Signature area — sign with your finger or a stylus"
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-400">
          {hasInk ? 'Signature captured.' : 'Sign in the box above.'}
        </p>
        <button
          type="button"
          onClick={clear}
          disabled={disabled || !hasInk}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-sm text-ink-600 hover:bg-ink-50 disabled:opacity-40"
        >
          <Eraser className="size-4" aria-hidden="true" />
          Clear
        </button>
      </div>
    </div>
  )
}

function SignatureForm({
  deliveryId,
  side,
  label,
  personName,
  action,
}: {
  deliveryId: string
  side: 'handover' | 'receiver'
  label: string
  personName: string | null
  action: (formData: FormData) => void
  }) {
  const [blob, setBlob] = useState<Blob | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  function submit(event: React.FormEvent<HTMLFormElement>) {
    if (!blob) {
      event.preventDefault()
      return
    }

    // Replace the empty file input with the captured PNG so the signature
    // travels as an ordinary upload and is validated like one.
    const input = formRef.current?.querySelector<HTMLInputElement>('input[name="signature"]')
    if (input) {
      const file = new File([blob], `${side}-signature.png`, { type: 'image/png' })
      const transfer = new DataTransfer()
      transfer.items.add(file)
      input.files = transfer.files
    }
  }

  return (
    <form ref={formRef} action={action} onSubmit={submit} className="space-y-3">
      <input type="hidden" name="deliveryId" value={deliveryId} />
      <input type="hidden" name="side" value={side} />
      <input type="file" name="signature" accept="image/png" className="sr-only" tabIndex={-1} />

      <div>
        <p className="text-sm font-medium text-ink-800">{label}</p>
        {personName ? <p className="text-xs text-ink-500">{personName}</p> : null}
      </div>

      <SignaturePad onChange={setBlob} />

      <SubmitButton pendingLabel="Saving…" disabled={!blob}>
        <PenLine className="size-4" aria-hidden="true" />
        Save this signature
      </SubmitButton>
    </form>
  )
}

export function DeliverySigning({
  deliveryId,
  status,
  handoverPersonName,
  receiverName,
  hasHandoverSignature,
  hasReceiverSignature,
  handoverSignedAt,
  receiverSignedAt,
  photos,
}: {
  deliveryId: string
  status: string
  handoverPersonName: string
  receiverName: string | null
  hasHandoverSignature: boolean
  hasReceiverSignature: boolean
  handoverSignedAt: string | null
  receiverSignedAt: string | null
  photos: Array<{ id: string; filename: string; caption: string | null }>
}) {
  const [signState, signAction] = useActionState(signDeliveryAction, null)
  const [photoState, photoAction] = useActionState(addDeliveryPhotoAction, null)

  const closed = status === 'confirmed' || status === 'cancelled'

  return (
    <>
      <Panel>
        <PanelHeader
          title="Signatures"
          description="Both sides sign at handover. These are handwritten marks, not the Director's official signature."
        />

        <div className="space-y-5 p-4 sm:p-5">
          <FormResult state={signState} />

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              {hasHandoverSignature ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge tone="ok">
                      <Check className="mr-1 inline size-3" aria-hidden="true" />
                      HA GROUP signed
                    </Badge>
                  </div>
                  <p className="text-sm text-ink-700">{handoverPersonName}</p>
                  <p className="text-xs text-ink-400">{formatDateTime(handoverSignedAt)}</p>
                </div>
              ) : closed ? (
                <p className="text-sm text-ink-500">Not signed.</p>
              ) : (
                <SignatureForm
                  deliveryId={deliveryId}
                  side="handover"
                  label="HA GROUP — delivered by"
                  personName={handoverPersonName}
                  action={signAction}
                />
              )}
            </div>

            <div className="space-y-2">
              {hasReceiverSignature ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge tone="ok">
                      <Check className="mr-1 inline size-3" aria-hidden="true" />
                      Client signed
                    </Badge>
                  </div>
                  <p className="text-sm text-ink-700">{receiverName ?? 'Client representative'}</p>
                  <p className="text-xs text-ink-400">{formatDateTime(receiverSignedAt)}</p>
                </div>
              ) : closed ? (
                <p className="text-sm text-ink-500">Not signed.</p>
              ) : (
                <SignatureForm
                  deliveryId={deliveryId}
                  side="receiver"
                  label="Client — received by"
                  personName={receiverName}
                  action={signAction}
                />
              )}
            </div>
          </div>

          {!closed && hasHandoverSignature && hasReceiverSignature ? (
            <Notice tone="ok">Both signatures captured — the delivery is confirmed.</Notice>
          ) : null}
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          title="Proof of delivery"
          description="Photographs taken at handover."
          action={<Badge tone={photos.length > 0 ? 'brand' : 'neutral'}>{photos.length}</Badge>}
        />
        <div className="space-y-3 p-4 sm:p-5">
          <FormResult state={photoState} />

          {!closed ? (
            <form action={photoAction} className="space-y-2">
              <input type="hidden" name="deliveryId" value={deliveryId} />
              <label className="tap-lg flex cursor-pointer items-center justify-center gap-2 rounded border border-dashed border-ink-300 px-4 text-sm font-medium text-ink-700 hover:border-brand-600 hover:bg-brand-50">
                <Camera className="size-4" aria-hidden="true" />
                Add photos
                <input
                  type="file"
                  name="photos"
                  accept="image/jpeg,image/png,image/webp,image/heic"
                  multiple
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => e.currentTarget.form?.requestSubmit()}
                />
              </label>
            </form>
          ) : null}

          {photos.length === 0 ? (
            <p className="text-sm text-ink-500">No photographs attached.</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {photos.map((p) => (
                <li key={p.id} className="py-2">
                  <a
                    href={`/api/delivery-photos/${p.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-brand-700 hover:underline"
                  >
                    {p.filename}
                  </a>
                  {p.caption ? <p className="text-xs text-ink-500">{p.caption}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>
    </>
  )
}

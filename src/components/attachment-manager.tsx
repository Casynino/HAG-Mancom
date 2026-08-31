'use client'

import { useActionState, useRef, useState } from 'react'
import {
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Mic,
  PenLine,
  Trash2,
  Video,
  type LucideIcon,
} from 'lucide-react'
import { Badge, Notice, Panel, PanelHeader } from '@/components/ui'
import { FormResult, SubmitButton } from '@/components/form'
import { ATTACHMENT_RULES, checkFile, formatBytes, type AttachmentKind } from '@/lib/storage/limits'
import { removeAttachmentAction, uploadAttachmentAction } from '@/server/submission-actions'

/**
 * Evidence capture.
 *
 * Each kind is its own tiny form, so the `accept` and `capture` hints are right
 * for what is being captured: on a phone, "Photo" opens the camera and "Voice
 * note" opens the recorder rather than a generic file browser.
 *
 * Files are checked in the browser first, using the same rules module the
 * server uses, so an oversized video fails immediately instead of after a long
 * upload on a site connection. The server repeats every check — the client copy
 * is a courtesy, never the control.
 */

const KIND_ICONS: Record<AttachmentKind, LucideIcon> = {
  photo: ImageIcon,
  video: Video,
  voice_note: Mic,
  drawing: PenLine,
  spreadsheet: FileSpreadsheet,
  document: FileText,
}

const KIND_ORDER: AttachmentKind[] = [
  'photo',
  'video',
  'voice_note',
  'drawing',
  'spreadsheet',
  'document',
]

export interface AttachmentRow {
  id: string
  kind: string
  originalFilename: string
  byteSize: number
  contentType: string
}

/** One capture control. Submits as soon as a valid file is chosen. */
function KindPicker({
  kind,
  submissionId,
  action,
  disabled,
  onReject,
}: {
  kind: AttachmentKind
  submissionId: string
  action: (formData: FormData) => void
  disabled: boolean
  onReject: (message: string) => void
}) {
  const rule = ATTACHMENT_RULES[kind]
  const Icon = KIND_ICONS[kind]
  const formRef = useRef<HTMLFormElement>(null)

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    if (!files || files.length === 0) return

    for (const file of Array.from(files)) {
      const head = new Uint8Array(await file.slice(0, 32).arrayBuffer())
      const verdict = checkFile({
        kind,
        filename: file.name,
        contentType: file.type,
        byteSize: file.size,
        head,
      })
      if (!verdict.ok) {
        onReject(`${file.name} — ${verdict.reason}`)
        event.target.value = ''
        return
      }
    }

    onReject('')
    formRef.current?.requestSubmit()
  }

  return (
    <form ref={formRef} action={action}>
      <input type="hidden" name="submissionId" value={submissionId} />
      <input type="hidden" name="kind" value={kind} />
      <label className="tap-lg flex cursor-pointer flex-col items-center justify-center gap-1 rounded border border-dashed border-ink-300 px-2 py-3 text-center hover:border-brand-600 hover:bg-brand-50 has-disabled:opacity-50">
        <Icon className="size-5 text-ink-500" aria-hidden="true" />
        <span className="text-xs font-medium text-ink-800">{rule.label}</span>
        <span className="text-[10px] text-ink-400">up to {formatBytes(rule.maxBytes)}</span>
        <input
          type="file"
          name="files"
          accept={rule.accept}
          multiple={kind === 'photo'}
          capture={kind === 'photo' ? 'environment' : undefined}
          className="sr-only"
          disabled={disabled}
          onChange={onChange}
        />
      </label>
    </form>
  )
}

export function AttachmentManager({
  submissionId,
  attachments,
  editable,
}: {
  submissionId: string
  attachments: AttachmentRow[]
  editable: boolean
}) {
  const [uploadState, uploadAction, uploading] = useActionState(uploadAttachmentAction, null)
  const [removeState, removeAction] = useActionState(removeAttachmentAction, null)
  const [clientError, setClientError] = useState('')

  return (
    <Panel>
      <PanelHeader
        title="Photos and files"
        description={
          editable
            ? 'Add what you captured on site. Originals are kept exactly as uploaded.'
            : 'Filed with this submission.'
        }
        action={
          <Badge tone={attachments.length > 0 ? 'brand' : 'neutral'}>{attachments.length}</Badge>
        }
      />

      <div className="space-y-4 p-4 sm:p-5">
        {clientError ? <Notice tone="risk">{clientError}</Notice> : null}
        <FormResult state={uploadState} />
        <FormResult state={removeState} />

        {editable ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {KIND_ORDER.map((kind) => (
                <KindPicker
                  key={kind}
                  kind={kind}
                  submissionId={submissionId}
                  action={uploadAction}
                  disabled={uploading}
                  onReject={setClientError}
                />
              ))}
            </div>
            {uploading ? (
              <p className="text-sm text-ink-500" role="status">
                Uploading…
              </p>
            ) : null}
          </>
        ) : null}

        {attachments.length === 0 ? (
          <p className="py-2 text-sm text-ink-500">
            {editable
              ? 'Nothing added yet. A submission needs at least one photo, file or measurement.'
              : 'No files were attached.'}
          </p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {attachments.map((a) => {
              const Icon = KIND_ICONS[a.kind as AttachmentKind] ?? FileText
              return (
                <li key={a.id} className="flex items-center gap-3 py-2.5">
                  <Icon className="size-4 shrink-0 text-ink-400" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <a
                      href={`/api/attachments/${a.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-sm font-medium text-brand-700 hover:underline"
                    >
                      {a.originalFilename}
                    </a>
                    <p className="text-xs text-ink-400 tabular">{formatBytes(a.byteSize)}</p>
                  </div>
                  {editable ? (
                    <form action={removeAction}>
                      <input type="hidden" name="submissionId" value={submissionId} />
                      <input type="hidden" name="attachmentId" value={a.id} />
                      <SubmitButton variant="ghost" size="sm" pendingLabel="Removing…">
                        <Trash2 className="size-4 text-risk-600" aria-hidden="true" />
                        <span className="sr-only">Remove {a.originalFilename}</span>
                      </SubmitButton>
                    </form>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Panel>
  )
}

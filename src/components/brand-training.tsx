'use client'

import { useActionState, useState } from 'react'
import { AlertTriangle, FileText, Sparkles, Upload } from 'lucide-react'
import {
  Badge,
  EmptyState,
  Field,
  Input,
  Notice,
  Panel,
  PanelHeader,
  Select,
} from '@/components/ui'
import { errorsFor, FormResult, SubmitButton } from '@/components/form'
import { DOCUMENT_TYPE_LABELS, formatDateTime } from '@/lib/display'
import { formatBytes } from '@/lib/storage/limits'
import {
  analyseTrainingDocumentAction,
  uploadTrainingDocumentAction,
  type BrandAnalysis,
} from '@/server/brand-training-actions'

/**
 * Teaching the assistant HA GROUP's own documentation standards.
 *
 * The screen is built around one idea: this produces a reading, not a ruling.
 * Every result is labelled with the assistant's own confidence, and nothing here
 * changes a single company setting — promoting anything into the Brand Profile
 * is a separate decision an Administrator makes on the settings screen. The
 * brief is explicit that the AI must not alter the company's knowledge base by
 * itself, and the shape of this page is what that looks like in practice.
 */

const STATUS: Record<
  string,
  { label: string; tone: 'neutral' | 'brand' | 'ok' | 'warn' | 'risk' }
> = {
  pending: { label: 'Not analysed', tone: 'neutral' },
  running: { label: 'Analysing', tone: 'brand' },
  completed: { label: 'Analysed', tone: 'ok' },
  failed: { label: 'Failed', tone: 'risk' },
  skipped: { label: 'No readable text', tone: 'warn' },
}

const CONFIDENCE: Record<string, { label: string; tone: 'ok' | 'warn' | 'risk' }> = {
  high: { label: 'High confidence', tone: 'ok' },
  medium: { label: 'Medium confidence', tone: 'warn' },
  low: { label: 'Low confidence', tone: 'risk' },
}

interface AssetRow {
  id: string
  label: string
  documentTypeHint: string | null
  originalFilename: string
  contentType: string
  byteSize: number
  analysisStatus: string
  analysisResult: unknown
  analysisError: string | null
  analysedAt: string | null
  uploadedAt: string
}

function Analysis({ result }: { result: BrandAnalysis }) {
  const confidence = CONFIDENCE[result.confidence] ?? CONFIDENCE.low!

  return (
    <div className="mt-3 space-y-4 rounded-lg border border-ink-200 bg-ink-50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={confidence.tone}>{confidence.label}</Badge>
        {result.documentType ? (
          <span className="text-sm text-ink-700">Reads as: {result.documentType}</span>
        ) : null}
      </div>

      {result.confidence === 'low' ? (
        <p className="text-xs leading-relaxed text-ink-500">
          One example rarely establishes a pattern. Upload more of the same document type before
          treating any of this as HA GROUP&rsquo;s standard.
        </p>
      ) : null}

      {result.referencePattern ? (
        <div>
          <p className="text-xs font-semibold tracking-[0.12em] text-ink-500 uppercase">
            Reference pattern
          </p>
          <p className="mt-1 font-mono text-sm text-ink-900">{result.referencePattern}</p>
        </div>
      ) : null}

      {result.headings.length > 0 ? (
        <div>
          <p className="text-xs font-semibold tracking-[0.12em] text-ink-500 uppercase">
            Headings used
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {result.headings.map((h) => (
              <li
                key={h}
                className="rounded border border-ink-200 bg-panel px-2 py-0.5 text-xs text-ink-700"
              >
                {h}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.standardClauses.length > 0 ? (
        <div>
          <p className="text-xs font-semibold tracking-[0.12em] text-ink-500 uppercase">
            Standard clauses
          </p>
          <dl className="mt-1.5 space-y-2">
            {result.standardClauses.map((c) => (
              <div key={c.heading}>
                <dt className="text-sm font-medium text-ink-900">{c.heading}</dt>
                <dd className="text-sm leading-relaxed text-ink-600">{c.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {result.observations.length > 0 ? (
        <div>
          <p className="text-xs font-semibold tracking-[0.12em] text-ink-500 uppercase">
            What it noticed
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink-600">
            {result.observations.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="border-t border-ink-200 pt-3 text-xs text-ink-500">
        This is a reading of one document, not a company standard. Nothing here has changed any
        setting — apply what you agree with in Company settings.
      </p>
    </div>
  )
}

export function BrandTraining({
  assets,
  aiAvailable,
}: {
  assets: AssetRow[]
  aiAvailable: boolean
}) {
  const [uploadState, uploadAction] = useActionState(uploadTrainingDocumentAction, null)
  const [analyseState, analyseAction] = useActionState(analyseTrainingDocumentAction, null)
  const [open, setOpen] = useState(assets.length === 0)

  return (
    <>
      {!aiAvailable ? (
        <Notice tone="neutral" title="The assistant is not configured">
          Documents can still be uploaded and are kept as the company&rsquo;s record. Analysis needs
          <code className="mx-1 rounded bg-ink-100 px-1 py-0.5 text-xs">ANTHROPIC_API_KEY</code>
          set in the deployment environment.
        </Notice>
      ) : null}

      <Panel>
        <PanelHeader
          title="Add a document HA GROUP has issued"
          description="A quotation, invoice, letter or certificate the company has already sent. PDF or plain text."
          action={
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="tap btn-primary flex items-center gap-2 rounded-lg px-3 text-sm font-medium"
            >
              <Upload className="size-4" aria-hidden="true" />
              {open ? 'Close' : 'Upload'}
            </button>
          }
        />

        {open ? (
          <form action={uploadAction} className="space-y-4 p-4 sm:p-5" noValidate>
            <FormResult state={uploadState} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="What is it?"
                htmlFor="label"
                required
                hint="e.g. Alliance One maintenance quotation, July 2026"
                errors={errorsFor(uploadState, 'label')}
              >
                <Input id="label" name="label" required maxLength={160} />
              </Field>

              <Field
                label="Document type"
                htmlFor="documentTypeHint"
                hint="Helps the assistant know what it is looking at."
              >
                <Select id="documentTypeHint" name="documentTypeHint" defaultValue="">
                  <option value="">Let the assistant work it out</option>
                  {Object.entries(DOCUMENT_TYPE_LABELS).map(([v, l]) => (
                    <option key={v} value={l}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field
              label="The document"
              htmlFor="document"
              required
              hint="A scan with no text layer cannot be read — it would need OCR first."
              errors={errorsFor(uploadState, 'document')}
            >
              <Input
                id="document"
                name="document"
                type="file"
                required
                accept="application/pdf,text/plain,text/markdown,.pdf,.txt,.md,.docx"
              />
            </Field>

            <SubmitButton pendingLabel="Uploading…">Upload</SubmitButton>
          </form>
        ) : null}
      </Panel>

      <Panel>
        <PanelHeader
          title="Uploaded documents"
          description="What the assistant has been given to learn from."
          action={<Badge tone="neutral">{assets.length}</Badge>}
        />

        <FormResult state={analyseState} />

        {assets.length === 0 ? (
          <EmptyState
            title="Nothing uploaded yet"
            description="Add a few documents HA GROUP has already issued. The more examples of one type, the more confident the reading."
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {assets.map((a) => {
              const status = STATUS[a.analysisStatus] ?? STATUS.pending!
              const result = a.analysisResult as BrandAnalysis | null

              return (
                <li key={a.id} className="px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-ink-50 text-ink-400">
                      <FileText className="size-4" aria-hidden="true" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-ink-900">{a.label}</p>
                        <Badge tone={status.tone}>{status.label}</Badge>
                        {a.documentTypeHint ? (
                          <Badge tone="neutral">{a.documentTypeHint}</Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-ink-500">
                        {a.originalFilename} · {formatBytes(a.byteSize)} ·{' '}
                        {a.analysedAt
                          ? `analysed ${formatDateTime(a.analysedAt)}`
                          : `uploaded ${formatDateTime(a.uploadedAt)}`}
                      </p>
                    </div>

                    {aiAvailable && a.analysisStatus !== 'running' ? (
                      <form action={analyseAction}>
                        <input type="hidden" name="assetId" value={a.id} />
                        <SubmitButton variant="secondary" size="sm" pendingLabel="Reading…">
                          <Sparkles className="size-4" aria-hidden="true" />
                          {a.analysisStatus === 'completed' ? 'Analyse again' : 'Analyse'}
                        </SubmitButton>
                      </form>
                    ) : null}
                  </div>

                  {a.analysisError ? (
                    <p className="mt-2 flex gap-2 rounded border border-warn-600/25 bg-warn-50 px-2.5 py-1.5 text-xs text-warn-700">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                      {a.analysisError}
                    </p>
                  ) : null}

                  {result ? <Analysis result={result} /> : null}
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
    </>
  )
}

'use client'

import { useActionState } from 'react'
import { Mail, RotateCw } from 'lucide-react'
import { Badge, Panel, PanelHeader } from '@/components/ui'
import { FormResult, SubmitButton } from '@/components/form'
import { formatDateTime } from '@/lib/display'
import { retryEmailAction } from '@/server/email-actions'

/**
 * What was sent to the client, and what failed.
 *
 * A send that failed silently is indistinguishable from one that was never
 * attempted, which is why the failure reason is shown verbatim rather than
 * summarised. Retry re-sends the same stored message with the same stored
 * attachments — it never re-renders the document, so what the client eventually
 * receives is the artefact that was approved.
 */

const TONE: Record<string, 'neutral' | 'ok' | 'warn' | 'risk'> = {
  queued: 'neutral',
  sending: 'neutral',
  sent: 'ok',
  delivered: 'ok',
  failed: 'risk',
  cancelled: 'neutral',
}

export function DocumentEmails({
  messages,
  canSend,
}: {
  messages: Array<{
    id: string
    subject: string
    toAddresses: string[]
    status: string
    provider: string
    failureReason: string | null
    attemptCount: number
    queuedAt: string
    sentAt: string | null
  }>
  canSend: boolean
}) {
  const [state, action] = useActionState(retryEmailAction, null)

  if (messages.length === 0) return null

  return (
    <Panel>
      <PanelHeader
        title="Sent to the client"
        description="Every attempt, including the ones that failed."
      />

      <div className="space-y-3 p-4 sm:p-5">
        <FormResult state={state} />

        <ul className="divide-y divide-ink-100">
          {messages.map((m) => (
            <li key={m.id} className="space-y-1.5 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-start gap-2">
                <Mail className="mt-0.5 size-4 shrink-0 text-ink-400" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-900">{m.subject}</p>
                  <p className="text-xs text-ink-500">{m.toAddresses.join(', ')}</p>
                </div>
                <Badge tone={TONE[m.status] ?? 'neutral'}>{m.status}</Badge>
              </div>

              <p className="text-xs text-ink-400">
                Queued {formatDateTime(m.queuedAt)}
                {m.sentAt ? ` · sent ${formatDateTime(m.sentAt)}` : ''}
                {m.attemptCount > 1 ? ` · ${m.attemptCount} attempts` : ''}
                {m.provider !== 'unconfigured' ? ` · via ${m.provider}` : ''}
              </p>

              {m.failureReason ? (
                <p className="rounded border border-risk-600/25 bg-risk-50 px-2.5 py-1.5 text-xs text-risk-700">
                  {m.failureReason}
                </p>
              ) : null}

              {canSend && m.status !== 'sent' && m.status !== 'delivered' ? (
                <form action={action}>
                  <input type="hidden" name="messageId" value={m.id} />
                  <SubmitButton variant="secondary" size="sm" pendingLabel="Sending…">
                    <RotateCw className="size-4" aria-hidden="true" />
                    Try again
                  </SubmitButton>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  )
}

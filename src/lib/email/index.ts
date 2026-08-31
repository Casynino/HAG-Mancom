import 'server-only'

/**
 * Outbound email.
 *
 * Provider behind an interface, for the same reason as the EFD adapter: HA
 * GROUP has not supplied mail credentials yet, and the platform should be
 * honest about that rather than silently dropping messages.
 *
 * Credentials are read from environment variables at call time and never
 * stored, logged, or returned to a caller. Nothing in `src/app` imports this
 * module directly — it is reachable only from Server Actions.
 */

export interface EmailAttachment {
  filename: string
  content: Buffer
  contentType: string
}

export interface EmailRequest {
  to: string[]
  cc?: string[]
  bcc?: string[]
  replyTo?: string | null
  subject: string
  text: string
  attachments?: EmailAttachment[]
}

export interface EmailResult {
  providerMessageId: string
  provider: string
}

export interface EmailProvider {
  readonly name: string
  isConfigured(): boolean
  send(request: EmailRequest): Promise<EmailResult>
}

/**
 * Used when nothing is configured. It refuses rather than pretending, so a
 * queued message stays queued and visibly un-sent instead of disappearing.
 */
class UnconfiguredProvider implements EmailProvider {
  readonly name = 'unconfigured'

  isConfigured(): boolean {
    return false
  }

  async send(): Promise<EmailResult> {
    throw new Error(
      'No email provider is configured. Set RESEND_API_KEY (or SMTP_URL) and EMAIL_FROM, ' +
        'then retry sending from the document. The message stays queued until then.',
    )
  }
}

/**
 * Resend. Chosen as the default because it is a plain HTTPS API with no
 * long-lived socket, which is what a serverless deployment needs — an SMTP
 * connection from a Vercel function is unreliable.
 */
class ResendProvider implements EmailProvider {
  readonly name = 'resend'

  isConfigured(): boolean {
    return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
  }

  async send(request: EmailRequest): Promise<EmailResult> {
    const apiKey = process.env.RESEND_API_KEY
    const from = process.env.EMAIL_FROM

    if (!apiKey || !from) {
      throw new Error('Email is not configured.')
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: request.to,
        cc: request.cc?.length ? request.cc : undefined,
        bcc: request.bcc?.length ? request.bcc : undefined,
        reply_to: request.replyTo ?? undefined,
        subject: request.subject,
        text: request.text,
        attachments: request.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content.toString('base64'),
        })),
      }),
    })

    if (!response.ok) {
      // The provider's message is surfaced, but the API key never is.
      const detail = await response.text().catch(() => '')
      throw new Error(
        `The email provider rejected the message (${response.status}). ${detail.slice(0, 300)}`,
      )
    }

    const body = (await response.json()) as { id?: string }
    return { providerMessageId: body.id ?? 'unknown', provider: this.name }
  }
}

let cached: EmailProvider | null = null

export function getEmailProvider(): EmailProvider {
  if (cached) return cached

  const resend = new ResendProvider()
  cached = resend.isConfigured() ? resend : new UnconfiguredProvider()
  return cached
}

/** Clears the cache after configuration changes. */
export function resetEmailProvider(): void {
  cached = null
}

export function isEmailConfigured(): boolean {
  return getEmailProvider().isConfigured()
}

/** What an Administrator still has to supply. */
export const EMAIL_REQUIREMENTS = [
  'A sending domain verified with the provider (SPF, DKIM and DMARC records).',
  'RESEND_API_KEY set in the deployment environment.',
  'EMAIL_FROM set to a verified address on that domain, e.g. business@hpcagroup.africa.',
] as const

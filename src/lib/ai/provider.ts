import 'server-only'

import Anthropic from '@anthropic-ai/sdk'

import { AppError } from '@/lib/errors'

/**
 * The AI adapter.
 *
 * One provider today, behind an interface, for the same reason as email and
 * EFD: HA GROUP may not have credentials configured, and the platform must say
 * so rather than degrade quietly.
 *
 * The boundaries the brief draws around AI are enforced by where this module is
 * called from, not by asking the model to behave:
 *
 *   * it never computes a total — the finance engine does, deterministically;
 *   * it never issues a reference — the database sequence does;
 *   * it never approves, signs or stamps — those require an authenticated
 *     human with the right role, checked in SQL;
 *   * it never sees data the requesting user cannot see, because every query
 *     that assembles its context runs under that user's RLS session.
 *
 * What it does is turn information a person already supplied into a first
 * draft of wording, and point out what is missing.
 */

export const AI_MODEL = 'claude-opus-5'

export interface AiUsage {
  inputTokens: number
  outputTokens: number
  latencyMs: number
}

export interface AiProvider {
  readonly name: string
  isConfigured(): boolean
  /**
   * Runs a prompt and returns a value validated against `schema`.
   * The model is constrained to the schema by the API, not by parsing prose.
   */
  structured<T>(input: {
    system: string
    prompt: string
    schema: Record<string, unknown>
    maxTokens?: number
    effort?: 'low' | 'medium' | 'high'
  }): Promise<{ value: T; usage: AiUsage }>
}

class UnconfiguredAiProvider implements AiProvider {
  readonly name = 'unconfigured'

  isConfigured(): boolean {
    return false
  }

  async structured<T>(): Promise<{ value: T; usage: AiUsage }> {
    throw new Error(
      'The AI assistant is not configured. An Administrator must set ANTHROPIC_API_KEY in the ' +
        'deployment environment. Everything else in the platform works without it — documents can ' +
        'be written by hand.',
    )
  }
}

class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic'
  private client: Anthropic | null = null

  isConfigured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY)
  }

  private getClient(): Anthropic {
    if (!this.client) {
      this.client = new Anthropic()
    }
    return this.client
  }

  async structured<T>(input: {
    system: string
    prompt: string
    schema: Record<string, unknown>
    maxTokens?: number
    effort?: 'low' | 'medium' | 'high'
  }): Promise<{ value: T; usage: AiUsage }> {
    const started = Date.now()

    let response: Anthropic.Message
    try {
      response = await this.getClient().messages.create({
        model: AI_MODEL,
        max_tokens: input.maxTokens ?? 8000,
        system: input.system,
        thinking: { type: 'adaptive' },
        output_config: {
          effort: input.effort ?? 'medium',
          format: {
            type: 'json_schema',
            schema: input.schema,
          },
        },
        messages: [{ role: 'user', content: input.prompt }],
      })
    } catch (err) {
      throw translateProviderError(err)
    }

    // A safety refusal is a valid outcome, not an exception to swallow.
    if (response.stop_reason === 'refusal') {
      throw new Error(
        'The assistant declined to answer this request. Write the wording by hand, or rephrase.',
      )
    }

    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('The assistant returned no usable content.')
    }

    let value: T
    try {
      value = JSON.parse(textBlock.text) as T
    } catch {
      throw new Error('The assistant returned a malformed response. Try again.')
    }

    return {
      value,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        latencyMs: Date.now() - started,
      },
    }
  }
}

/**
 * Turns an Anthropic transport failure into something an Administrator can act on.
 *
 * Without this every one of these — an expired key, a revoked key, an exhausted
 * credit balance — reaches the user as "Something went wrong. Please try again",
 * because the generic handler deliberately refuses to leak internals it does not
 * recognise. That is the right default and the wrong answer here: each of these
 * has a specific, boring remedy, and only an Administrator can carry it out.
 *
 * The messages name the remedy, not the mechanism. Nothing here reveals the key,
 * the account, or anything about the request.
 */
function translateProviderError(err: unknown): Error {
  if (!(err instanceof Anthropic.APIError)) {
    return err instanceof Error ? err : new Error('The assistant could not be reached.')
  }

  const detail = String(
    (err as { error?: { error?: { message?: string } } }).error?.error?.message ?? '',
  )

  // Credit exhausted arrives as a 400, not a payment status.
  if (/credit balance|insufficient/i.test(detail)) {
    return new AppError(
      'The company\u2019s Claude credit balance is exhausted. An Administrator must add credit in the ' +
        'Anthropic Console before the assistant can draft again. Documents can still be written by hand.',
      'ai_no_credit',
      402,
    )
  }

  switch (err.status) {
    case 401:
      return new AppError(
        'The Claude API key is not valid \u2014 it has most likely expired or been revoked. An ' +
          'Administrator must issue a new key in the Anthropic Console and set it as ANTHROPIC_API_KEY. ' +
          'Everything else in the platform is unaffected.',
        'ai_key_invalid',
        503,
      )
    case 403:
      return new AppError(
        'The Claude API key is not permitted to make this request. An Administrator should check the ' +
          'key\u2019s workspace and scope in the Anthropic Console.',
        'ai_key_forbidden',
        503,
      )
    case 429:
      return new AppError(
        'The assistant is rate limited at the moment. Wait a minute and try again, or write the ' +
          'wording by hand.',
        'ai_rate_limited',
        429,
      )
    case 529:
      return new AppError(
        'The assistant is overloaded at the moment. Try again shortly, or write the wording by hand.',
        'ai_overloaded',
        503,
      )
    default:
      if (err.status && err.status >= 500) {
        return new AppError(
          'The assistant is unavailable at the moment. Try again shortly, or write the wording by hand.',
          'ai_unavailable',
          503,
        )
      }
      return new AppError(
        'The assistant could not complete this request. Try again, or write the wording by hand.',
        'ai_request_failed',
        502,
      )
  }
}

let cached: AiProvider | null = null

export function getAiProvider(): AiProvider {
  if (cached) return cached
  const anthropic = new AnthropicProvider()
  cached = anthropic.isConfigured() ? anthropic : new UnconfiguredAiProvider()
  return cached
}

export function resetAiProvider(): void {
  cached = null
}

/** Exposed for tests only; the translation is otherwise an internal detail. */
export const __translateProviderErrorForTests = translateProviderError

export function isAiConfigured(): boolean {
  return getAiProvider().isConfigured()
}

export const AI_REQUIREMENTS = [
  'An Anthropic API key with access to Claude, set as ANTHROPIC_API_KEY in the deployment environment.',
  'A decision on which client information may be sent to the model. Today the assistant is sent ' +
    'only the engineer submission, the project name and the client name — never TIN, VRN, bank ' +
    'details or pricing.',
] as const

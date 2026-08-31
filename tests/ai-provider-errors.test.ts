import { describe, expect, it } from 'vitest'
import Anthropic from '@anthropic-ai/sdk'
import { AppError } from '@/lib/errors'
import { __translateProviderErrorForTests as translate } from '@/lib/ai/provider'

/**
 * An expired key, a revoked key and an exhausted balance each have a specific,
 * boring remedy that only an Administrator can carry out. Before this, all three
 * reached the user as "Something went wrong. Please try again" — the generic
 * handler doing exactly what it should with an error it did not recognise.
 *
 * These tests hold the line at the shape that matters: the failure names the
 * remedy, and it never names the key.
 */

function apiError(status: number, detail?: string) {
  return new Anthropic.APIError(
    status,
    detail ? { error: { message: detail, type: 'invalid_request_error' } } : undefined,
    detail ?? 'request failed',
    undefined,
  )
}

describe('provider error translation', () => {
  it('tells an Administrator to reissue an expired or revoked key', () => {
    const err = translate(apiError(401))
    expect(err).toBeInstanceOf(AppError)
    expect((err as AppError).code).toBe('ai_key_invalid')
    expect(err.message).toMatch(/ANTHROPIC_API_KEY/)
    expect(err.message).toMatch(/expired or been revoked/)
  })

  it('recognises an exhausted credit balance, which arrives as a 400', () => {
    const err = translate(apiError(400, 'Your credit balance is too low to access the API'))
    expect((err as AppError).code).toBe('ai_no_credit')
    expect(err.message).toMatch(/add credit/)
  })

  it('separates being rate limited from being broken', () => {
    expect((translate(apiError(429)) as AppError).code).toBe('ai_rate_limited')
    expect((translate(apiError(529)) as AppError).code).toBe('ai_overloaded')
    expect((translate(apiError(503)) as AppError).code).toBe('ai_unavailable')
  })

  it('says the work can still be done by hand', () => {
    for (const status of [401, 429, 529, 503]) {
      expect(translate(apiError(status)).message).toMatch(/by hand|unaffected/)
    }
  })

  it('never leaks the key or the raw provider detail', () => {
    const err = translate(apiError(401, 'invalid x-api-key sk-ant-secret-value'))
    expect(err.message).not.toMatch(/sk-ant/)
    expect(err.message).not.toMatch(/x-api-key/)
  })

  it('passes a non-provider error through unchanged', () => {
    const boom = new Error('socket hang up')
    expect(translate(boom)).toBe(boom)
  })
})

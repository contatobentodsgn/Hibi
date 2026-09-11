import { describe, expect, expectTypeOf, it } from 'vitest'

import type {
  AiFallbackPolicy,
  AiModelPreset,
  AiNormalizedUsage,
  AiProviderFailure,
  AiProviderStreamEvent,
} from '../contracts'
import {
  classifyProviderFailure,
  normalizeUsage,
  parseRetryAfter,
  recommendedModelPresets,
  retryDelayFor,
} from '../production'

describe('normalizeUsage', () => {
  it('normalizes compatible provider token names and computes the total from normalized parts', () => {
    expect(
      normalizeUsage({
        prompt_tokens: 12,
        input_tokens: 14,
        completion_tokens: 5,
        output_tokens: 7,
        total_tokens: 999,
        estimated_cost: 0.004,
      }),
    ).toEqual({
      inputTokens: 14,
      outputTokens: 7,
      totalTokens: 21,
      estimatedCost: 0.004,
    })
  })

  it('falls back to alternate provider token names', () => {
    expect(
      normalizeUsage({ prompt_tokens: 12, completion_tokens: 5, estimatedCost: 0.01 }),
    ).toEqual({ inputTokens: 12, outputTokens: 5, totalTokens: 17, estimatedCost: 0.01 })
  })

  it('caps an overflowing normalized total at the largest finite number', () => {
    const usage = normalizeUsage({
      input_tokens: Number.MAX_VALUE,
      output_tokens: Number.MAX_VALUE,
    })

    expect(usage).toEqual({
      inputTokens: Number.MAX_VALUE,
      outputTokens: Number.MAX_VALUE,
      totalTokens: Number.MAX_VALUE,
    })
    expect(Number.isFinite(usage.totalTokens)).toBe(true)
  })

  it('uses zeroes for missing, malformed, negative, or non-finite usage values', () => {
    expect(
      normalizeUsage({
        prompt_tokens: -1,
        input_tokens: Number.POSITIVE_INFINITY,
        completion_tokens: Number.NaN,
        output_tokens: '7',
        estimated_cost: -0.01,
      }),
    ).toEqual({ inputTokens: 0, outputTokens: 0, totalTokens: 0 })
    expect(normalizeUsage(null)).toEqual({ inputTokens: 0, outputTokens: 0, totalTokens: 0 })
    expect(normalizeUsage([])).toEqual({ inputTokens: 0, outputTokens: 0, totalTokens: 0 })
  })
})

describe('classifyProviderFailure', () => {
  it.each([401, 403])('classifies HTTP %i as non-retryable invalid credentials without raw text', (status) => {
    const failure = classifyProviderFailure({ status, message: 'credential: secret-value' })

    expect(failure).toEqual({ code: 'invalid_credentials', retryable: false })
    expect(JSON.stringify(failure)).not.toContain('secret-value')
  })

  it('classifies rate limiting as retryable', () => {
    expect(classifyProviderFailure({ statusCode: 429 })).toEqual({
      code: 'rate_limited',
      retryable: true,
    })
  })

  it.each([
    { label: 'timeout code', input: { code: 'ETIMEDOUT' } },
    { label: 'network code', input: { code: 'ENOTFOUND' } },
    { label: 'HTTP timeout', input: { status: 408 } },
    { label: 'server error', input: { response: { status: 503 } } },
  ])('classifies $label as retryable unavailability', ({ input }) => {
    expect(classifyProviderFailure(input)).toEqual({ code: 'unavailable', retryable: true })
  })

  it('classifies malformed provider responses as non-retryable without raw text', () => {
    const failure = classifyProviderFailure({ name: 'SyntaxError', message: 'invalid response: secret-value' })

    expect(failure).toEqual({ code: 'invalid_response', retryable: false })
    expect(JSON.stringify(failure)).not.toContain('secret-value')
  })

  // Endpoint, id de modelo ou forma do pedido errados. Não é a resposta que está ilegível,
  // e repetir o mesmo pedido nunca passa a funcionar.
  it.each([400, 404, 422])('classifies HTTP %i as a non-retryable invalid request without raw text', (status) => {
    const failure = classifyProviderFailure({ status, message: 'model_not_found: secret-value' })

    expect(failure).toEqual({ code: 'invalid_request', retryable: false })
    expect(JSON.stringify(failure)).not.toContain('secret-value')
  })

  it('keeps every other client status as an invalid request instead of a retryable outage', () => {
    expect(classifyProviderFailure({ status: 405 })).toEqual({ code: 'invalid_request', retryable: false })
    expect(classifyProviderFailure({ response: { status: 409 } })).toEqual({ code: 'invalid_request', retryable: false })
  })

  it('prefers an explicit malformed-response marker over the status range', () => {
    expect(classifyProviderFailure({ status: 400, code: 'invalid_response' })).toEqual({
      code: 'invalid_response',
      retryable: false,
    })
  })

  it('classifies AbortError as a non-retryable cancellation', () => {
    expect(classifyProviderFailure(new DOMException('cancelled', 'AbortError'))).toEqual({
      code: 'cancelled',
      retryable: false,
    })
  })

  it('treats malformed and unknown failures as retryable unavailability', () => {
    expect(classifyProviderFailure(null)).toEqual({ code: 'unavailable', retryable: true })
    expect(classifyProviderFailure({ status: '503', message: 'secret-value' })).toEqual({
      code: 'unavailable',
      retryable: true,
    })
  })
})

describe('parseRetryAfter', () => {
  const nowMs = Date.parse('2030-01-01T00:00:00.000Z')

  it('parses positive retry-after seconds and caps the result at one minute', () => {
    expect(parseRetryAfter('1.5', nowMs)).toBe(1_500)
    expect(parseRetryAfter(120, nowMs)).toBe(60_000)
  })

  it('parses a future HTTP date and caps it at one minute', () => {
    expect(parseRetryAfter('Tue, 01 Jan 2030 00:00:05 GMT', nowMs)).toBe(5_000)
    expect(parseRetryAfter('Tue, 01 Jan 2030 00:02:00 GMT', nowMs)).toBe(60_000)
  })

  it.each([undefined, null, '', '0', 0, -1, Number.POSITIVE_INFINITY, 'not-a-date', 'Tue, 01 Jan 2029 00:00:00 GMT'])(
    'rejects malformed, non-positive, and expired retry-after values: %j',
    (value) => {
      expect(parseRetryAfter(value, nowMs)).toBeUndefined()
    },
  )
})

describe('retryDelayFor', () => {
  it('uses deterministic exponential delays capped at four seconds', () => {
    expect(retryDelayFor(1)).toBe(1_000)
    expect(retryDelayFor(2)).toBe(2_000)
    expect(retryDelayFor(3)).toBe(4_000)
    expect(retryDelayFor(99)).toBe(4_000)
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('bounds malformed attempt values: %j', (attempt) => {
    expect(retryDelayFor(attempt)).toBe(1_000)
  })
})

describe('production contracts', () => {
  it('defines every streaming event and safe supporting contract', () => {
    const usage: AiNormalizedUsage = { inputTokens: 3, outputTokens: 2, totalTokens: 5 }
    const failure: AiProviderFailure = { code: 'rate_limited', retryable: true, retryAfterMs: 1_000 }
    const events: AiProviderStreamEvent[] = [
      { type: 'started' },
      { type: 'delta', delta: 'Hel' },
      { type: 'usage', usage },
      { type: 'completed' },
      { type: 'retrying', attempt: 1, delayMs: 1_000, failure },
      { type: 'failed', failure },
    ]
    const policy: AiFallbackPolicy = 'ask'

    expect(events.map((event) => event.type)).toEqual([
      'started',
      'delta',
      'usage',
      'completed',
      'retrying',
      'failed',
    ])
    expect(policy).toBe('ask')
    expectTypeOf(recommendedModelPresets).toEqualTypeOf<readonly AiModelPreset[]>()
  })

  it('offers vendor-neutral human-readable model presets while retaining custom free text', () => {
    expect(recommendedModelPresets.map((preset) => preset.id)).toEqual([
      'fast',
      'balanced',
      'reasoning',
      'custom',
    ])
    expect(recommendedModelPresets.every((preset) => preset.label && preset.description)).toBe(true)
    expect(recommendedModelPresets.some((preset) => 'model' in preset)).toBe(false)
  })
})

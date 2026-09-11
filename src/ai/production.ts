import type {
  AiModelPreset,
  AiNormalizedUsage,
  AiProviderFailure,
} from './contracts'

type UnknownRecord = Record<string, unknown>

const MAX_RETRY_AFTER_MS = 60_000

function recordFrom(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined
}

function valueFor(record: UnknownRecord | undefined, key: string): unknown {
  try {
    return record?.[key]
  } catch {
    return undefined
  }
}

function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined
}

function firstFiniteNonNegative(record: UnknownRecord | undefined, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = finiteNonNegative(valueFor(record, key))
    if (value !== undefined) return value
  }
  return undefined
}

function statusFor(record: UnknownRecord | undefined): number | undefined {
  const direct = finiteNonNegative(valueFor(record, 'status'))
    ?? finiteNonNegative(valueFor(record, 'statusCode'))
  if (direct !== undefined) return direct
  return finiteNonNegative(valueFor(recordFrom(valueFor(record, 'response')), 'status'))
}

function stringFor(record: UnknownRecord | undefined, key: string): string | undefined {
  const value = valueFor(record, key)
  return typeof value === 'string' ? value : undefined
}

function retryAfterMsFor(record: UnknownRecord | undefined): number | undefined {
  const value = finiteNonNegative(valueFor(record, 'retryAfterMs'))
  return value && value > 0 ? Math.min(value, MAX_RETRY_AFTER_MS) : undefined
}

function failure(code: AiProviderFailure['code'], retryable: boolean, retryAfterMs?: number): AiProviderFailure {
  return {
    code,
    retryable,
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  }
}

/** Converts common provider usage envelopes into one safe, renderer-friendly shape. */
export function normalizeUsage(value: unknown): AiNormalizedUsage {
  const record = recordFrom(value)
  const inputTokens = firstFiniteNonNegative(record, ['input_tokens', 'prompt_tokens']) ?? 0
  const outputTokens = firstFiniteNonNegative(record, ['output_tokens', 'completion_tokens']) ?? 0
  const estimatedCost = firstFiniteNonNegative(record, ['estimatedCost', 'estimated_cost'])
  const totalTokens = Math.min(inputTokens + outputTokens, Number.MAX_VALUE)

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    ...(estimatedCost === undefined ? {} : { estimatedCost }),
  }
}

/** Maps unknown provider errors to a small, non-sensitive failure vocabulary. */
export function classifyProviderFailure(input: unknown): AiProviderFailure {
  const record = recordFrom(input)
  const name = stringFor(record, 'name')?.toLowerCase()
  const code = stringFor(record, 'code')?.toLowerCase()
  const type = stringFor(record, 'type')?.toLowerCase()
  const status = statusFor(record)

  if (name === 'aborterror' || code === 'abort_err' || code === 'aborted') {
    return failure('cancelled', false)
  }
  if (status === 401 || status === 403) return failure('invalid_credentials', false)
  if (status === 429) return failure('rate_limited', true, retryAfterMsFor(record))
  if (name === 'syntaxerror' || code === 'invalid_response' || type === 'malformed_response') {
    return failure('invalid_response', false)
  }
  if (
    status === 408
    || (status !== undefined && status >= 500 && status <= 599)
    || name === 'timeouterror'
    || name === 'typeerror'
    || code?.includes('timeout')
    || code?.includes('network')
    || code?.startsWith('econn')
    || code?.startsWith('enet')
    || code === 'enotfound'
  ) {
    return failure('unavailable', true)
  }
  // 408 já saiu como indisponível acima, e um marcador de resposta ilegível também.
  // O 4xx restante é a requisição — endpoint, id de modelo ou forma do pedido — e repetir não resolve.
  if (status !== undefined && status >= 400 && status < 500) {
    return failure('invalid_request', false)
  }
  return failure('unavailable', true)
}

/** Parses a Retry-After header value without allowing waits longer than one minute. */
export function parseRetryAfter(value: unknown, nowMs: number): number | undefined {
  const seconds = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim())
      ? Number(value.trim())
      : undefined
  if (seconds !== undefined) {
    return Number.isFinite(seconds) && seconds > 0
      ? Math.min(seconds * 1_000, MAX_RETRY_AFTER_MS)
      : undefined
  }
  if (typeof value !== 'string' || !Number.isFinite(nowMs)) return undefined
  const retryAtMs = Date.parse(value)
  if (!Number.isFinite(retryAtMs) || retryAtMs <= nowMs) return undefined
  return Math.min(retryAtMs - nowMs, MAX_RETRY_AFTER_MS)
}

/** Returns the fixed retry backoff for a one-based retry attempt. */
export function retryDelayFor(attempt: number): number {
  const boundedAttempt = Number.isFinite(attempt) && attempt > 0
    ? Math.floor(attempt)
    : 1
  return Math.min(1_000 * 2 ** Math.max(0, boundedAttempt - 1), 4_000)
}

export const recommendedModelPresets: readonly AiModelPreset[] = Object.freeze([
  {
    id: 'fast',
    label: 'Fast',
    description: 'Use a quick model for short answers and simple tasks.',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Use a general-purpose model for everyday assistance.',
  },
  {
    id: 'reasoning',
    label: 'Reasoning',
    description: 'Use a more deliberate model for complex planning and analysis.',
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Enter the model identifier supplied by your provider.',
  },
])

import type { AiNormalizedUsage } from './contracts'

export type AiUsageOutcome = 'completed' | 'failed'

export type AiUsageRecord = Readonly<{
  at: string
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCost?: number
  outcome: AiUsageOutcome
  fallback: boolean
}>

export type AiUsageRecordInput = Readonly<{
  at: string
  provider: string
  model: string
  usage: AiNormalizedUsage
  outcome: AiUsageOutcome
  fallback: boolean
}>

const MAX_ENTRIES = 100
const MAX_TEXT_LENGTH = 240
const MAX_TOKENS = 10_000_000
const PRICES_PER_MILLION: Readonly<Record<string, Readonly<{ input: number; output: number }>>> = Object.freeze({
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1': { input: 2, output: 8 },
})

const safeText = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_TEXT_LENGTH) return undefined
  return value.replace(/(?:Bearer\s+|sk-)[^\s,;]+/gi, '[redacted]').replace(/(?:api[_-]?key|token)\s*[:=]\s*[^\s,;]+/gi, '[redacted]')
}

const safeTokenCount = (value: unknown): number | undefined => typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value) && value >= 0 && value <= MAX_TOKENS ? value : undefined
const object = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
const retentionLimit = (value: number): number => Number.isInteger(value) && value >= 0 ? Math.min(value, MAX_ENTRIES) : MAX_ENTRIES

export function estimateAiUsageCost(model: string, usage: Pick<AiNormalizedUsage, 'inputTokens' | 'outputTokens'>): number | undefined {
  const pricing = PRICES_PER_MILLION[model]
  if (!pricing) return undefined
  return (usage.inputTokens * pricing.input + usage.outputTokens * pricing.output) / 1_000_000
}

function usageFrom(value: unknown): Pick<AiNormalizedUsage, 'inputTokens' | 'outputTokens' | 'totalTokens'> | undefined {
  const usage = object(value)
  const inputTokens = safeTokenCount(usage?.inputTokens)
  const outputTokens = safeTokenCount(usage?.outputTokens)
  if (inputTokens === undefined || outputTokens === undefined || inputTokens + outputTokens > MAX_TOKENS) return undefined
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens }
}

export function sanitizeAiUsageRecord(value: unknown): AiUsageRecord | undefined {
  const record = object(value)
  const at = typeof record?.at === 'string' && !Number.isNaN(Date.parse(record.at)) ? record.at : undefined
  const provider = safeText(record?.provider)
  const model = safeText(record?.model)
  const usage = usageFrom(record)
  const outcome = record?.outcome === 'completed' || record?.outcome === 'failed' ? record.outcome : undefined
  const fallback = typeof record?.fallback === 'boolean' ? record.fallback : undefined
  if (!at || !provider || !model || !usage || !outcome || fallback === undefined) return undefined
  const estimatedCost = estimateAiUsageCost(model, usage)
  return { at, provider, model, ...usage, ...(estimatedCost === undefined ? {} : { estimatedCost }), outcome, fallback }
}

export function usageRecordFor(value: unknown): AiUsageRecord | undefined {
  const input = object(value)
  return sanitizeAiUsageRecord({ ...input, ...object(input?.usage) })
}

export function loadAiUsageLedger(serialized: string | null, maximum = MAX_ENTRIES): AiUsageRecord[] {
  try {
    const parsed: unknown = JSON.parse(serialized ?? '[]')
    return Array.isArray(parsed) ? parsed.map(sanitizeAiUsageRecord).filter((entry): entry is AiUsageRecord => Boolean(entry)).slice(0, retentionLimit(maximum)) : []
  } catch { return [] }
}

export function appendAiUsageRecord(entries: readonly AiUsageRecord[], entry: unknown, maximum = MAX_ENTRIES): AiUsageRecord[] {
  const next = usageRecordFor(entry)
  const existing = entries.map(sanitizeAiUsageRecord).filter((value): value is AiUsageRecord => Boolean(value))
  return (next ? [next, ...existing] : existing).slice(0, retentionLimit(maximum))
}

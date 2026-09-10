import { describe, expect, it } from 'vitest'
import { appendAiUsageRecord, loadAiUsageLedger } from '../history'

describe('AI usage ledger', () => {
  const knownUsage = {
    at: '2026-09-09T12:00:00.000Z',
    provider: 'OpenAI-compatible',
    model: 'gpt-4.1-mini',
    usage: { inputTokens: 1_000, outputTokens: 500, totalTokens: 1_500 },
    outcome: 'completed' as const,
    fallback: false,
  }

  it('keeps only bounded, safe usage fields and estimates a known model cost', () => {
    const entries = appendAiUsageRecord([], {
      ...knownUsage,
      prompt: 'private study plan',
      apiKey: 'sk-secret-value',
      context: { note: 'private' },
    })

    expect(entries).toEqual([{
      at: knownUsage.at,
      provider: 'OpenAI-compatible',
      model: 'gpt-4.1-mini',
      inputTokens: 1_000,
      outputTokens: 500,
      totalTokens: 1_500,
      estimatedCost: 0.0012,
      outcome: 'completed',
      fallback: false,
    }])
    expect(JSON.stringify(entries)).not.toContain('private')
    expect(JSON.stringify(entries)).not.toContain('secret')
  })

  it('does not invent a cost for an unknown model', () => {
    const [entry] = appendAiUsageRecord([], { ...knownUsage, model: 'provider-private-model', usage: { inputTokens: 8, outputTokens: 3, totalTokens: 11 } })

    expect(entry).toEqual(expect.objectContaining({ model: 'provider-private-model', inputTokens: 8, outputTokens: 3, totalTokens: 11 }))
    expect(entry).not.toHaveProperty('estimatedCost')
  })

  it('sanitizes persisted records and retains the newest bounded entries only', () => {
    const loaded = loadAiUsageLedger(JSON.stringify([{
      ...knownUsage,
      inputTokens: 1_000,
      outputTokens: 500,
      totalTokens: 1_500,
      estimatedCost: 123,
      prompt: 'do not retain',
      authorization: 'Bearer secret-value',
    }]))
    const entries = appendAiUsageRecord(loaded, { ...knownUsage, at: '2026-09-09T12:01:00.000Z', model: 'gpt-4.1', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }, 1)

    expect(entries).toEqual([{
      at: '2026-09-09T12:01:00.000Z',
      provider: 'OpenAI-compatible',
      model: 'gpt-4.1',
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 2,
      estimatedCost: 0.00001,
      outcome: 'completed',
      fallback: false,
    }])
    expect(JSON.stringify(loaded)).not.toContain('do not retain')
    expect(JSON.stringify(loaded)).not.toContain('secret-value')
  })

  it('never lets a caller expand retention beyond the local ledger cap', () => {
    const entries = Array.from({ length: 101 }, (_, index) => appendAiUsageRecord([], { ...knownUsage, at: new Date(Date.parse(knownUsage.at) + index * 1_000).toISOString() })[0]!).filter(Boolean)

    expect(loadAiUsageLedger(JSON.stringify(entries), 1_000)).toHaveLength(100)
  })
})

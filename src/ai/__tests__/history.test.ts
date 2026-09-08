import { describe, expect, it } from 'vitest'
import { AiHistory, appendAiAuditEvent, loadAiAuditHistory } from '../history'

describe('AI history', () => {
  it('records bounded audit entries without retaining request text, tool arguments, or credentials', () => {
    const history = new AiHistory(2)
    history.record({ type: 'tool.requested', requestId: 'r1', provider: 'OpenAI-compatible', model: 'gpt-test', tools: ['task.delete'], summary: 'delete requested', at: '2026-09-07T12:00:00.000Z' })
    history.record({ type: 'confirmation.cancelled', requestId: 'r1', tools: ['task.delete'], summary: 'cancelled', at: '2026-09-07T12:01:00.000Z' })
    history.record({ type: 'failed', requestId: 'r2', summary: 'Provider request failed (401), api_key=secret-value.', at: '2026-09-07T12:02:00.000Z' })

    expect(history.entries()).toEqual([
      expect.objectContaining({ type: 'failed', requestId: 'r2' }),
      expect.objectContaining({ type: 'confirmation.cancelled', requestId: 'r1', tools: ['task.delete'] }),
    ])
    expect(JSON.stringify(history.entries())).not.toContain('sk-')
    expect(JSON.stringify(history.entries())).not.toContain('secret-value')
  })

  it('sanitizes persisted entries and rejects malformed audit records', () => {
    const entries = loadAiAuditHistory(JSON.stringify([
      { type: 'tool.requested', requestId: 'request-1', at: '2026-09-07T12:00:00.000Z', summary: 'Bearer secret-token', tools: ['task.create'], arguments: { title: 'private' }, message: 'private request' },
      { type: 'unknown', requestId: 'request-2', at: 'invalid', summary: 'discard me' },
      { type: 'failed', requestId: '', at: '2026-09-07T12:01:00.000Z', summary: 'discard me' },
    ]))

    expect(entries).toEqual([{ type: 'tool.requested', requestId: 'request-1', at: '2026-09-07T12:00:00.000Z', summary: '[redacted]', tools: ['task.create'] }])
    expect(JSON.stringify(entries)).not.toContain('private')
    expect(JSON.stringify(entries)).not.toContain('secret-token')
  })

  it('sanitizes audit events when appending and clears only AI entries', () => {
    const initial = loadAiAuditHistory(JSON.stringify([{ type: 'turn.received', requestId: 'request-1', at: '2026-09-07T12:00:00.000Z', summary: 'received' }]))
    const next = appendAiAuditEvent(initial, { type: 'failed', requestId: 'request-1', at: '2026-09-07T12:01:00.000Z', summary: 'api_key=super-secret', extra: 'user message' })
    const history = new AiHistory()
    next.forEach((entry) => history.record(entry))

    expect(next).toEqual([
      { type: 'failed', requestId: 'request-1', at: '2026-09-07T12:01:00.000Z', summary: '[redacted]' },
      { type: 'turn.received', requestId: 'request-1', at: '2026-09-07T12:00:00.000Z', summary: 'received' },
    ])
    history.clear()
    expect(history.entries()).toEqual([])
  })
})

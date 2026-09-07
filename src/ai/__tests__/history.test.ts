import { describe, expect, it } from 'vitest'
import { AiHistory } from '../history'

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
})

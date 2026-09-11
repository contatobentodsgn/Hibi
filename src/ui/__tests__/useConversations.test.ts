import { describe, expect, it } from 'vitest'
import { recordTurn } from '../useConversations'
import { createConversation } from '../../domain/conversations'

const at = (hour: number) => new Date(2026, 8, 11, hour, 0).toISOString()

describe('recordTurn', () => {
  it('starts a conversation on the first question, from any surface', () => {
    const next = recordTurn({ conversations: [], activeId: null }, { role: 'user', text: 'oi', at: at(9) }, 'c-1')
    expect(next.activeId).toBe('c-1')
    expect(next.conversations[0].messages).toHaveLength(1)
  })

  it('appends to the active conversation instead of starting another', () => {
    const state = { conversations: [createConversation('oi', at(9), 'c-1')], activeId: 'c-1' }
    const next = recordTurn(state, { role: 'assistant', text: 'Olá!', at: at(10) }, 'c-2')
    expect(next.conversations).toHaveLength(1)
    expect(next.conversations[0].messages).toHaveLength(2)
    expect(next.activeId).toBe('c-1')
  })

  it('never records the same assistant transition twice', () => {
    const state = { conversations: [createConversation('oi', at(9), 'c-1')], activeId: 'c-1' }
    const message = { role: 'assistant' as const, text: 'Olá!', at: at(10) }
    const once = recordTurn(state, message, 'c-2')
    expect(recordTurn(once, message, 'c-3')).toBe(once)
  })
})

import { describe, expect, it } from 'vitest'
import { recordTurn, recordTurnInConversation } from '../useConversations'
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

  it('keeps an assistant reply in the conversation that started the turn after the visible selection changes', () => {
    const first = createConversation('primeira pergunta', at(9), 'c-1')
    const second = createConversation('segunda pergunta', at(10), 'c-2')
    const state = { conversations: [first, second], activeId: 'c-2' }

    const next = recordTurnInConversation(state, { role: 'assistant', text: 'resposta da primeira', at: at(11) }, 'c-1')

    expect(next.conversations.find((conversation) => conversation.id === 'c-1')?.messages.at(-1)?.text).toBe('resposta da primeira')
    expect(next.conversations.find((conversation) => conversation.id === 'c-2')?.messages).toHaveLength(1)
    expect(next.activeId).toBe('c-2')
  })
})

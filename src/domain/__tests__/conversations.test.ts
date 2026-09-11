import { describe, expect, it } from 'vitest'
import { appendMessage, createConversation, titleFor } from '../conversations'

const at = (hour: number) => new Date(2026, 8, 11, hour, 0).toISOString()

describe('conversations', () => {
  it('creates a conversation titled after the first message', () => {
    const conversation = createConversation('Quais tarefas vencem hoje?', at(9), 'c-1')

    expect(conversation).toMatchObject({ id: 'c-1', title: 'Quais tarefas vencem hoje?', createdAt: at(9), updatedAt: at(9) })
    expect(conversation.messages).toEqual([{ role: 'user', text: 'Quais tarefas vencem hoje?', at: at(9) }])
  })

  it('shortens a long first message into a title without cutting mid-word', () => {
    const longer = 'Preciso reorganizar a agenda da semana inteira considerando as reuniões novas'
    expect(titleFor(longer).length).toBeLessThanOrEqual(60)
    expect(titleFor(longer).endsWith('…')).toBe(true)
    expect(titleFor(longer)).not.toMatch(/\s…$/)
  })

  it('appends a message and moves updatedAt without touching createdAt', () => {
    const created = createConversation('oi', at(9), 'c-1')
    const replied = appendMessage(created, { role: 'assistant', text: 'Olá!', at: at(10), provenance: 'Hibi local tools' })

    expect(replied.messages).toHaveLength(2)
    expect(replied.messages[1]).toEqual({ role: 'assistant', text: 'Olá!', at: at(10), provenance: 'Hibi local tools' })
    expect(replied.updatedAt).toBe(at(10))
    expect(replied.createdAt).toBe(at(9))
    expect(created.messages).toHaveLength(1)
  })
})

import { describe, expect, it } from 'vitest'
import { appendMessage, createConversation, pruneConversations, sanitizeConversation, searchConversations, titleFor } from '../conversations'

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

  it('redacts pasted credentials before a message is ever stored', () => {
    const conversation = createConversation('minha chave é sk-abcdef123456 ok?', at(9), 'c-1')
    expect(conversation.messages[0].text).toBe('minha chave é [redacted] ok?')

    const withHeader = appendMessage(conversation, { role: 'user', text: 'usei Authorization: Bearer gsk_live_9f8e7d', at: at(10) })
    expect(withHeader.messages[1].text).toContain('[redacted]')
    expect(withHeader.messages[1].text).not.toContain('gsk_live_9f8e7d')
  })

  it('drops malformed records and keeps the valid ones', () => {
    const valid = createConversation('oi', at(9), 'c-1')
    expect(sanitizeConversation(valid)).toEqual(valid)
    expect(sanitizeConversation({ id: 'c-2', title: 'sem mensagens', createdAt: at(9), updatedAt: at(9), messages: 'nope' })).toBeUndefined()
    expect(sanitizeConversation({ ...valid, messages: [{ role: 'ghost', text: 'x', at: at(9) }] })).toBeUndefined()
    expect(sanitizeConversation(null)).toBeUndefined()
  })

  it('searches the text of messages, not only titles', () => {
    const first = appendMessage(createConversation('agenda da semana', at(9), 'c-1'), { role: 'assistant', text: 'Reunião com o cliente Kabrito', at: at(9) })
    const second = createConversation('lista de compras', at(10), 'c-2')

    expect(searchConversations([first, second], 'kabrito').map((item) => item.id)).toEqual(['c-1'])
    expect(searchConversations([first, second], 'LISTA').map((item) => item.id)).toEqual(['c-2'])
    expect(searchConversations([first, second], '   ').map((item) => item.id)).toEqual(['c-1', 'c-2'])
  })

  it('prunes the oldest conversation once the cap is reached', () => {
    const many = Array.from({ length: 51 }, (_, index) => createConversation(`pergunta ${index}`, new Date(2026, 8, 11, 9, index).toISOString(), `c-${index}`))
    const pruned = pruneConversations(many, { maxConversations: 50 })

    expect(pruned).toHaveLength(50)
    expect(pruned.some((item) => item.id === 'c-0')).toBe(false)
    expect(pruned[0].id).toBe('c-50')
  })
})

import { describe, expect, it } from 'vitest'
import { createConversation } from '../../domain/conversations'
import { CONVERSATIONS_STORAGE_KEY, loadConversations, saveConversations } from '../conversation-store'

const at = (hour: number) => new Date(2026, 8, 11, hour, 0).toISOString()
const fakeStorage = (initial: string | null = null) => {
  let value = initial
  return { getItem: () => value, setItem: (_key: string, next: string) => { value = next }, read: () => value }
}

describe('conversation store', () => {
  it('writes to its own key, outside the workspace data', () => {
    const storage = fakeStorage()
    expect(saveConversations(storage, [createConversation('oi', at(9), 'c-1')])).toBe(true)
    expect(CONVERSATIONS_STORAGE_KEY).toBe('hibi-conversations')
    expect(JSON.parse(storage.read() ?? '[]')).toHaveLength(1)
  })

  it('reports a failed write instead of throwing', () => {
    const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError') } }
    expect(saveConversations(full, [createConversation('oi', at(9), 'c-1')])).toBe(false)
  })

  it('keeps valid conversations when one stored record is corrupt', () => {
    const valid = createConversation('oi', at(9), 'c-1')
    const storage = fakeStorage(JSON.stringify([valid, { id: 'c-2', messages: 'nope' }]))
    expect(loadConversations(storage).map((item) => item.id)).toEqual(['c-1'])
  })

  it('degrades to an empty list when storage is unreadable', () => {
    expect(loadConversations({ getItem: () => { throw new Error('blocked') } })).toEqual([])
    expect(loadConversations(fakeStorage('not json'))).toEqual([])
  })
})

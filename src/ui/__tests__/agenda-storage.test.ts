import { describe, expect, it } from 'vitest'
import { AGENDA_VIEW_STORAGE_KEY, readAgendaMode, writeAgendaMode } from '../agenda-storage'

const fakeStorage = (initial: string | null = null) => {
  const store = new Map<string, string>()
  if (initial !== null) store.set(AGENDA_VIEW_STORAGE_KEY, initial)
  return { store, storage: { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value) } } }
}

describe('agenda-storage', () => {
  it('lê "week" quando salvo', () => {
    const { storage } = fakeStorage('week')
    expect(readAgendaMode(storage)).toBe('week')
  })

  it('cai em "day" quando o valor está ausente', () => {
    const { storage } = fakeStorage(null)
    expect(readAgendaMode(storage)).toBe('day')
  })

  it('cai em "day" para um valor inválido', () => {
    const { storage } = fakeStorage('junk')
    expect(readAgendaMode(storage)).toBe('day')
  })

  it('cai em "day" quando a leitura do storage lança', () => {
    const storage = { getItem: () => { throw new Error('indisponível') } }
    expect(readAgendaMode(storage)).toBe('day')
  })

  it('a escrita persiste através do host', () => {
    const { store, storage } = fakeStorage(null)
    writeAgendaMode(storage, 'week')
    expect(store.get(AGENDA_VIEW_STORAGE_KEY)).toBe('week')
  })

  it('a escrita não lança quando o storage falha', () => {
    const storage = { setItem: () => { throw new Error('indisponível') } }
    expect(() => writeAgendaMode(storage, 'week')).not.toThrow()
  })
})

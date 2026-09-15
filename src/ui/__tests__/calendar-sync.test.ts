import { describe, expect, it } from 'vitest'
import { isCalendarSyncMode, isCalendarSyncProvider, labelCalendarSources, type CalendarSyncState } from '../calendar-sync'

describe('calendar sync renderer contract', () => {
  it('accepts only the two supported providers and bounded calendar modes', () => {
    expect(isCalendarSyncProvider('apple')).toBe(true)
    expect(isCalendarSyncProvider('google')).toBe(true)
    expect(isCalendarSyncProvider('icloud')).toBe(false)
    expect(isCalendarSyncMode('disabled')).toBe(true)
    expect(isCalendarSyncMode('read-only')).toBe(true)
    expect(isCalendarSyncMode('bidirectional')).toBe(true)
    expect(isCalendarSyncMode('write-only')).toBe(false)
  })

  it('models sources, selected calendars and conflicts without event contents', () => {
    const state: CalendarSyncState = {
      sources: [{ id: 'apple-local', provider: 'apple', label: 'Apple Calendar', state: 'needs-permission' }],
      calendars: [{ id: 'work', sourceId: 'apple-local', label: 'Work', mode: 'read-only', lastSyncedAt: '2026-09-12T09:00:00' }],
      conflicts: [{ id: 'conflict-1', calendarId: 'work', kind: 'concurrent-update', summary: '1 event needs review' }],
    }

    expect(state.calendars[0]?.mode).toBe('read-only')
    expect(state.conflicts[0]?.summary).toBe('1 event needs review')
  })

  it('names each source in the renderer, since the main process sends only identifiers', () => {
    const state = labelCalendarSources({
      sources: [{ id: 'apple', provider: 'apple', state: 'connected' }, { id: 'google', provider: 'google', state: 'disconnected' }],
      calendars: [],
      conflicts: [],
    })

    expect(state.sources.map((source) => source.label)).toEqual(['Calendário do Mac', 'Google Calendar'])
    expect(state.sources[0]?.state).toBe('connected')
  })
})

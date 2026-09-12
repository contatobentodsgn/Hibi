import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CalendarSyncPanel } from '../CalendarSyncPanel'
import type { CalendarSyncState } from '../calendar-sync'

const state: CalendarSyncState = {
  sources: [
    { id: 'apple-local', provider: 'apple', label: 'Calendários Apple', state: 'connected', lastSyncedAt: '2026-09-12T09:00:00' },
    { id: 'google-work', provider: 'google', label: 'Google Calendar', state: 'error', error: 'temporarily-unavailable' },
  ],
  calendars: [{ id: 'work', sourceId: 'apple-local', label: 'Trabalho', mode: 'bidirectional', lastSyncedAt: '2026-09-12T09:00:00' }],
  conflicts: [{ id: 'conflict-1', calendarId: 'work', kind: 'concurrent-update', summary: '1 evento precisa de revisão' }],
}

describe('CalendarSyncPanel', () => {
  it('renders provider state, selected calendar, safe error and actionable conflict', () => {
    const markup = renderToStaticMarkup(<CalendarSyncPanel state={state} onConnect={() => undefined} onChangeMode={() => undefined} onSync={() => undefined} onResolveConflict={() => undefined} />)

    expect(markup).toContain('Calendários conectados')
    expect(markup).toContain('Calendários Apple')
    expect(markup).toContain('Google Calendar')
    expect(markup).toContain('temporarily unavailable')
    expect(markup).toContain('Trabalho')
    expect(markup).toContain('Última sincronização')
    expect(markup).toContain('1 evento precisa de revisão')
    expect(markup).toContain('aria-label="Resolver conflito: 1 evento precisa de revisão"')
    expect(markup).toContain('aria-label="Modo de sincronização para Trabalho"')
  })
})

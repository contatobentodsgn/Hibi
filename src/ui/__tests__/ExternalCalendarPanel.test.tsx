import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ExternalCalendarPanel } from '../redesign/screens/ExternalCalendarPanel';

describe('ExternalCalendarPanel', () => {
  it('expõe fontes, eventos, alterações pendentes e conflito sem resolver nada automaticamente', () => {
    const markup = renderToStaticMarkup(<ExternalCalendarPanel
      state={{
        sources: [{ id: 'google', provider: 'google', label: 'Google Calendar', state: 'connected', lastSyncedAt: '2026-09-20T14:30:00' }],
        calendars: [{ id: 'google:work', sourceId: 'google', label: 'Trabalho', mode: 'bidirectional' }],
        conflicts: [{ id: 'conflict-1', calendarId: 'google:work', kind: 'remote-deleted', summary: 'Reunião de planejamento' }],
      }}
      events={[{ source: 'Google Calendar', title: 'Reunião de cliente', date: '2026-09-20', startsAt: '2026-09-20T10:00:00', endsAt: '2026-09-20T11:00:00', readonly: true }]}
      changes={{ outgoing: [{ localId: 'block-1', calendarId: 'google:work', summary: 'Preparar proposta' }], incoming: [] }}
      onRefresh={vi.fn()}
      onSendChange={vi.fn()}
      onBringChange={vi.fn()}
      onResolveConflict={vi.fn()}
    />);

    expect(markup).toContain('Google Calendar');
    expect(markup).toContain('Trabalho');
    expect(markup).toContain('Reunião de cliente');
    expect(markup).toContain('Preparar proposta');
    expect(markup).toContain('Recriar no calendário');
    expect(markup).toContain('Manter apenas no Pixano');
  });
});

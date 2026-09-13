import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { externalEventsForWeek } from '../external-calendar-events';
import { ExternalCalendarAgenda } from '../ExternalCalendarAgenda';

describe('externalEventsForWeek', () => {
  it('keeps only events that overlap the visible week and marks them as read-only', () => {
    const events = externalEventsForWeek('2026-09-14', [
      { sourceId: 'apple', calendarId: 'apple:work', remoteId: 'event-1', title: 'Reunião de planejamento', startsAt: '2026-09-15T10:00:00', endsAt: '2026-09-15T11:00:00', allDay: false, writable: true },
      { sourceId: 'google', calendarId: 'google:team', remoteId: 'event-2', title: 'Fora da semana', startsAt: '2026-09-25T10:00:00', endsAt: '2026-09-25T11:00:00', allDay: false, writable: false },
    ]);

    expect(events).toEqual([{ source: 'Apple Calendar', title: 'Reunião de planejamento', date: '2026-09-15', startsAt: '2026-09-15T10:00:00', endsAt: '2026-09-15T11:00:00', readonly: true }]);
  });
});

describe('ExternalCalendarAgenda', () => {
  it('renders remote events as read-only calendar items without edit controls', () => {
    const markup = renderToStaticMarkup(React.createElement(ExternalCalendarAgenda, { events: [{ source: 'Google Calendar', title: 'Reunião externa', date: '2026-09-15', startsAt: '2026-09-15T10:00:00', endsAt: '2026-09-15T11:00:00', readonly: true }] }));

    expect(markup).toContain('Reunião externa');
    expect(markup).toContain('Somente leitura');
    expect(markup).not.toContain('button');
  });
});

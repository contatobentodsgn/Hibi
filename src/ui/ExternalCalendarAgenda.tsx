import React from 'react';
import type { ReadonlyAgendaEvent } from './external-calendar-events';

export function ExternalCalendarAgenda({ events }: Readonly<{ events: readonly ReadonlyAgendaEvent[] }>) {
  if (events.length === 0) return null;
  return <section className="external-calendar-agenda" aria-label="Eventos externos somente leitura">
    <div className="external-calendar-heading"><div><p className="eyebrow">AGENDA EXTERNA</p><h2>Eventos conectados</h2></div><span className="pill muted">Somente leitura</span></div>
    <ul>{events.map((event) => <li className="external-calendar-event" key={`${event.source}-${event.startsAt}-${event.title}`}><div><strong>{event.title}</strong><span>{event.source} · {event.date} · {event.startsAt.slice(11, 16)}–{event.endsAt.slice(11, 16)}</span></div><span aria-label="Somente leitura">Somente leitura</span></li>)}</ul>
  </section>;
}

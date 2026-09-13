import { shiftDayKey } from '../domain/date-context';

export type ExternalCalendarEvent = Readonly<{
  sourceId: 'apple' | 'google';
  calendarId: string;
  remoteId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  writable: boolean;
  cancelled?: boolean;
}>;

export type ReadonlyAgendaEvent = Readonly<{
  source: 'Apple Calendar' | 'Google Calendar';
  title: string;
  date: string;
  startsAt: string;
  endsAt: string;
  readonly: true;
}>;

export function externalEventsForWeek(weekStart: string, events: readonly ExternalCalendarEvent[]): readonly ReadonlyAgendaEvent[] {
  const weekEnd = shiftDayKey(weekStart, 7);
  return events
    .filter((event) => !event.cancelled && event.startsAt.slice(0, 10) < weekEnd && event.endsAt.slice(0, 10) >= weekStart)
    .map((event) => ({
      source: event.sourceId === 'apple' ? 'Apple Calendar' : 'Google Calendar',
      title: event.title,
      date: event.startsAt.slice(0, 10),
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      readonly: true,
    }));
}

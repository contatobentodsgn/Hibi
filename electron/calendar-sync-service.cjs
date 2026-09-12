const boundedText = (value, maximum = 240) => typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1_000;
const parseInstant = (value) => boundedText(value) && !Number.isNaN(Date.parse(value)) ? new Date(value) : null;

function appleSource(eventKit) {
  if (!eventKit?.available?.()) return { id: 'apple', provider: 'apple', label: 'Calendário do Mac', state: 'needs-permission', error: 'configuration-incomplete' };
  const status = eventKit.authorizationStatus();
  if (status === 'full-access') return { id: 'apple', provider: 'apple', label: 'Calendário do Mac', state: 'connected' };
  if (status === 'denied' || status === 'restricted') return { id: 'apple', provider: 'apple', label: 'Calendário do Mac', state: 'needs-permission', error: 'permission-denied' };
  return { id: 'apple', provider: 'apple', label: 'Calendário do Mac', state: 'needs-permission' };
}

function googleSource(status) {
  if (status?.state === 'connected') return { id: 'google', provider: 'google', label: 'Google Calendar', state: 'connected' };
  return { id: 'google', provider: 'google', label: 'Google Calendar', state: 'disconnected' };
}

function createCalendarSyncService({ eventKit, integrations, settings, now = () => new Date().toISOString() } = {}) {
  if (!eventKit || typeof eventKit.available !== 'function' || typeof eventKit.authorizationStatus !== 'function') throw new Error('An EventKit bridge is required.');
  if (!integrations || typeof integrations.listStatus !== 'function') throw new Error('An integration manager is required.');
  if (!settings || typeof settings.get !== 'function') throw new Error('Calendar settings are required.');

  const selectedGoogle = () => {
    const entry = settings.get('google-calendar');
    return Array.isArray(entry?.targets) ? entry.targets.filter((target) => boundedText(target?.id)) : [];
  };
  const appleCalendars = () => {
    if (appleSource(eventKit).state !== 'connected') return [];
    return (eventKit.listCalendars() ?? []).flatMap((calendar) => {
      if (!boundedText(calendar?.id) || !boundedText(calendar?.label)) return [];
      const suffix = boundedText(calendar?.sourceLabel) ? ` · ${calendar.sourceLabel}` : '';
      return [{ id: `apple:${calendar.id}`, sourceId: 'apple', label: `${calendar.label}${suffix}`.slice(0, 240), mode: 'read-only' }];
    });
  };

  return {
    async getState() {
      const statuses = await integrations.listStatus();
      const google = googleSource(Array.isArray(statuses) ? statuses.find((entry) => entry?.id === 'google-calendar') : null);
      return {
        sources: [appleSource(eventKit), google],
        calendars: [...appleCalendars(), ...selectedGoogle().map((calendar) => ({ id: `google:${calendar.id}`, sourceId: 'google', label: boundedText(calendar.label) ? calendar.label : calendar.id, mode: 'read-only' }))],
        conflicts: [],
      };
    },
    async requestAppleAccess() {
      if (!eventKit.available()) throw new Error('The macOS Calendar bridge is unavailable.');
      if (eventKit.authorizationStatus() !== 'full-access') await eventKit.requestFullAccess();
      if (eventKit.authorizationStatus() !== 'full-access') throw new Error('Calendar full access was not granted.');
      return { state: 'connected', syncedAt: now() };
    },
    async discoverGoogleCalendars() {
      if (typeof integrations.listImportTargets !== 'function') throw new Error('Google Calendar discovery is unavailable.');
      const targets = await integrations.listImportTargets('google-calendar');
      return (Array.isArray(targets) ? targets : []).flatMap((target) => boundedText(target?.id) ? [{ id: target.id, label: boundedText(target?.label) ? target.label : target.id }] : []);
    },
    async readEvents(input = {}) {
      const start = parseInstant(input.start); const end = parseInstant(input.end);
      if (!start || !end || end <= start || end.getTime() - start.getTime() > MAX_RANGE_MS) throw new Error('Calendar event range is invalid.');
      const calendars = Array.isArray(input.calendars) ? input.calendars.slice(0, 200) : [];
      const appleIds = calendars.filter((calendar) => calendar?.sourceId === 'apple' && boundedText(calendar.id) && calendar.id.startsWith('apple:')).map((calendar) => calendar.id.slice('apple:'.length));
      const googleIds = calendars.filter((calendar) => calendar?.sourceId === 'google' && boundedText(calendar.id) && calendar.id.startsWith('google:')).map((calendar) => calendar.id.slice('google:'.length));
      const events = [];
      if (appleIds.length > 0) {
        if (appleSource(eventKit).state !== 'connected') throw new Error('Calendar full access is required.');
        for (const event of eventKit.listEvents({ start: start.toISOString(), end: end.toISOString(), calendarIds: appleIds }) ?? []) {
          if (!boundedText(event?.id, 240) || !boundedText(event?.calendarId, 240) || !boundedText(event?.title, 240) || !boundedText(event?.startsAt, 240) || !boundedText(event?.endsAt, 240)) continue;
          events.push({ sourceId: 'apple', calendarId: `apple:${event.calendarId}`, remoteId: event.id, title: event.title, startsAt: event.startsAt, endsAt: event.endsAt, allDay: event.allDay === true, writable: event.writable === true });
        }
      }
      if (googleIds.length > 0) {
        if (typeof integrations.readCalendarEvents !== 'function') throw new Error('Google Calendar event reading is unavailable.');
        for (const calendarId of googleIds) {
          const remoteEvents = await integrations.readCalendarEvents('google-calendar', { calendarId, timeMin: start.toISOString(), timeMax: end.toISOString() });
          for (const event of remoteEvents ?? []) {
            if (!boundedText(event?.remoteId, 240) || !boundedText(event?.title, 240) || !boundedText(event?.startsAt, 240) || !boundedText(event?.endsAt, 240)) continue;
            events.push({ sourceId: 'google', calendarId: `google:${calendarId}`, remoteId: event.remoteId, title: event.title, startsAt: event.startsAt, endsAt: event.endsAt, allDay: event.allDay === true, writable: false, ...(event.cancelled === true ? { cancelled: true } : {}) });
          }
        }
      }
      return events;
    },
  };
}

module.exports = { createCalendarSyncService };

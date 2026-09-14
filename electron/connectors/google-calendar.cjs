const MAX_PAGE_SIZE = 250;
const MAX_PAGES = 20;
const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1_000;
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3/';
const boundedText = (value, maximum = 240) => typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
const parseInstant = (value) => boundedText(value) && !Number.isNaN(Date.parse(value)) ? new Date(value) : null;

function prepareCalendarCreate(payload) {
  if (!payload || typeof payload !== 'object' || !boundedText(payload.calendarId) || !boundedText(payload.title) || !parseInstant(payload.startsAt) || !parseInstant(payload.endsAt) || parseInstant(payload.endsAt) <= parseInstant(payload.startsAt)) throw new Error('Google Calendar event is invalid.');
  return { calendarId: payload.calendarId, title: payload.title, startsAt: payload.startsAt, endsAt: payload.endsAt, allDay: payload.allDay === true };
}

function failureFor(response, fallback) {
  if (response?.status === 401) return new Error('Google Calendar authorization expired. Reconnect this calendar.');
  if (response?.status === 403) return new Error('Google Calendar denied access to this calendar.');
  if (response?.status === 429) return new Error('Google Calendar is temporarily rate limited. Try again later.');
  return new Error(fallback);
}

function normalizeGoogleEvent(event) {
  if (!event || !boundedText(event.id)) return null;
  const allDay = boundedText(event.start?.date) && boundedText(event.end?.date);
  const startsAt = allDay ? event.start.date : event.start?.dateTime;
  const endsAt = allDay ? event.end.date : event.end?.dateTime;
  if (!boundedText(startsAt) || !boundedText(endsAt)) return null;
  return { remoteId: event.id, ...(boundedText(event.etag) ? { revision: event.etag } : {}), title: boundedText(event.summary) ? event.summary.slice(0, 240) : 'Untitled event', startsAt, endsAt, allDay: Boolean(allDay), ...(event.status === 'cancelled' ? { cancelled: true } : {}) };
}

function createGoogleCalendarConnector({ request, oauth } = {}) {
  const api = new URL(GOOGLE_CALENDAR_API);
  const call = async (path, init, override) => {
    const transport = override ?? request;
    if (typeof transport !== 'function') throw new Error('A Google Calendar request implementation is required.');
    return transport(new URL(path, api).toString(), init);
  };
  const headers = (credential) => ({ Authorization: `Bearer ${credential}`, Accept: 'application/json' });
  const defaultOauth = { pkce: true, authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token', scopes: ['https://www.googleapis.com/auth/calendar'], authorizationParams: { access_type: 'offline', prompt: 'consent' } };
  return {
    id: 'google-calendar', label: 'Google Calendar', allowedHosts: ['www.googleapis.com', 'accounts.google.com', 'oauth2.googleapis.com'], capabilities: ['import', 'write', 'sync'],
    ...(oauth === null ? {} : { oauth: oauth ? { ...defaultOauth, ...oauth } : defaultOauth }),
    async testConnection({ credential, request: override }) {
      const response = await call('users/me/calendarList?maxResults=1', { method: 'GET', headers: headers(credential) }, override);
      if (!response?.ok) throw failureFor(response, 'Google Calendar rejected this authorization.');
      return { ok: true, detail: 'Google Calendar authorization accepted.' };
    },
    async listImportTargets({ credential, request: override }) {
      const targets = []; let pageToken;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const query = new URLSearchParams({ maxResults: String(MAX_PAGE_SIZE) });
        if (pageToken) query.set('pageToken', pageToken);
        const response = await call(`users/me/calendarList?${query.toString()}`, { method: 'GET', headers: headers(credential) }, override);
        if (!response?.ok) throw failureFor(response, 'Google Calendar could not list calendars.');
        const body = await response.json().catch(() => ({}));
        for (const item of Array.isArray(body?.items) ? body.items : []) {
          if (!boundedText(item?.id)) continue;
          const label = boundedText(item?.summaryOverride) ? item.summaryOverride : boundedText(item?.summary) ? item.summary : item.id;
          targets.push({ id: item.id, label: label.slice(0, 240) });
        }
        pageToken = boundedText(body?.nextPageToken) ? body.nextPageToken : undefined;
        if (!pageToken) break;
      }
      return targets.slice(0, MAX_PAGE_SIZE * MAX_PAGES);
    },
    async fetchCalendarEvents({ credential, calendarId, timeMin, timeMax, request: override }) {
      if (!boundedText(calendarId)) throw new Error('Google Calendar identifier is invalid.');
      const start = parseInstant(timeMin); const end = parseInstant(timeMax);
      if (!start || !end || end <= start || end.getTime() - start.getTime() > MAX_RANGE_MS) throw new Error('Google Calendar time range is invalid.');
      const events = []; let pageToken;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const query = new URLSearchParams({ singleEvents: 'true', showDeleted: 'true', maxResults: String(MAX_PAGE_SIZE), timeMin: start.toISOString(), timeMax: end.toISOString() });
        if (pageToken) query.set('pageToken', pageToken);
        const response = await call(`calendars/${encodeURIComponent(calendarId)}/events?${query.toString()}`, { method: 'GET', headers: headers(credential) }, override);
        if (!response?.ok) throw failureFor(response, 'Google Calendar could not read events.');
        const body = await response.json().catch(() => ({}));
        for (const item of Array.isArray(body?.items) ? body.items : []) { const event = normalizeGoogleEvent(item); if (event) events.push(event); }
        pageToken = boundedText(body?.nextPageToken) ? body.nextPageToken : undefined;
        if (!pageToken) break;
      }
      return events;
    },
    prepareWrite({ kind, payload }) {
      if (kind !== 'calendar.create') throw new Error('Google Calendar action is unsupported.');
      return { kind, payload: prepareCalendarCreate(payload) };
    },
    async executeApproved({ kind, payload, credential, request: override }) {
      if (kind !== 'calendar.create') throw new Error('Google Calendar action is unsupported.');
      const event = prepareCalendarCreate(payload);
      const body = event.allDay
        ? { summary: event.title, start: { date: event.startsAt.slice(0, 10) }, end: { date: event.endsAt.slice(0, 10) } }
        : { summary: event.title, start: { dateTime: event.startsAt }, end: { dateTime: event.endsAt } };
      const response = await call(`calendars/${encodeURIComponent(event.calendarId)}/events`, { method: 'POST', headers: { ...headers(credential), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, override);
      if (!response?.ok) throw failureFor(response, 'Google Calendar could not create the event.');
      const created = await response.json().catch(() => ({}));
      if (!boundedText(created?.id)) throw new Error('Google Calendar returned an invalid event.');
      return { remoteId: created.id, ...(boundedText(created.etag) ? { revision: created.etag } : {}) };
    },
  };
}

module.exports = { GOOGLE_CALENDAR_API, createGoogleCalendarConnector, normalizeGoogleEvent };

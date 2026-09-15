const MAX_PAGE_SIZE = 250;
const MAX_PAGES = 20;
const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1_000;
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3/";
const boundedText = (value, maximum = 240) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= maximum;
const parseInstant = (value) =>
  boundedText(value) && !Number.isNaN(Date.parse(value))
    ? new Date(value)
    : null;

// Hora sem offset seria lida no fuso da conta Google, não no do Mac. O processo principal sempre manda o
// instante com offset; aqui só se recusa o que chegar sem ele.
const WITH_OFFSET = /T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}/;
const TIME_ZONE = /^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$/;
// Ids de evento do Google: base32hex minúsculo, de 5 a 1024 caracteres.
const EVENT_ID = /^[a-v0-9]{5,1024}$/;
const addDays = (dateKey, days) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

function prepareCalendarCreate(payload) {
  if (
    !payload ||
    typeof payload !== "object" ||
    !boundedText(payload.calendarId) ||
    !boundedText(payload.title)
  )
    throw new Error("Google Calendar event is invalid.");
  const allDay = payload.allDay === true;
  if (
    allDay
      ? !DATE_KEY.test(String(payload.startsAt)) || !DATE_KEY.test(String(payload.endsAt))
      : !WITH_OFFSET.test(String(payload.startsAt)) || !WITH_OFFSET.test(String(payload.endsAt))
  )
    throw new Error("Google Calendar event time needs an offset.");
  const start = parseInstant(payload.startsAt);
  const end = parseInstant(payload.endsAt);
  if (!start || !end || end <= start)
    throw new Error("Google Calendar event is invalid.");
  if (
    payload.timeZone !== undefined &&
    (typeof payload.timeZone !== "string" || !TIME_ZONE.test(payload.timeZone))
  )
    throw new Error("Google Calendar time zone is invalid.");
  if (
    payload.eventId !== undefined &&
    (typeof payload.eventId !== "string" || !EVENT_ID.test(payload.eventId))
  )
    throw new Error("Google Calendar event identifier is invalid.");
  return {
    calendarId: payload.calendarId,
    title: payload.title,
    startsAt: payload.startsAt,
    endsAt: payload.endsAt,
    allDay,
    ...(payload.timeZone !== undefined ? { timeZone: payload.timeZone } : {}),
    ...(payload.eventId !== undefined ? { eventId: payload.eventId } : {}),
  };
}

function prepareCalendarUpdate(payload) {
  const { eventId: _ignored, ...event } = prepareCalendarCreate(payload);
  if (!boundedText(payload.remoteId) || !boundedText(payload.expectedRevision))
    throw new Error("Google Calendar event revision is invalid.");
  return {
    ...event,
    remoteId: payload.remoteId,
    expectedRevision: payload.expectedRevision,
  };
}

// O Google trata `end.date` como exclusivo. Um fim à meia-noite já é o dia seguinte; qualquer outro
// horário ainda ocupa o próprio dia, então o fim avança um dia.
function allDayRange(startsAt, endsAt) {
  const start = startsAt.slice(0, 10);
  const endDay = endsAt.slice(0, 10);
  const endsAtMidnight =
    endsAt.length === 10 || /T00:00(?::00(?:\.0+)?)?(?:Z|[+-]|$)/.test(endsAt);
  let end = endsAtMidnight ? endDay : addDays(endDay, 1);
  if (end <= start) end = addDays(start, 1);
  return { start: { date: start }, end: { date: end } };
}

function failureFor(response, fallback) {
  if (response?.status === 401)
    return new Error(
      "Google Calendar authorization expired. Reconnect this calendar.",
    );
  if (response?.status === 403)
    return new Error("Google Calendar denied access to this calendar.");
  if (response?.status === 429)
    return new Error(
      "Google Calendar is temporarily rate limited. Try again later.",
    );
  return new Error(fallback);
}

function normalizeGoogleEvent(event) {
  if (!event || !boundedText(event.id)) return null;
  const allDay = boundedText(event.start?.date) && boundedText(event.end?.date);
  const startsAt = allDay ? event.start.date : event.start?.dateTime;
  const endsAt = allDay ? event.end.date : event.end?.dateTime;
  if (!boundedText(startsAt) || !boundedText(endsAt)) return null;
  return {
    remoteId: event.id,
    ...(boundedText(event.etag) ? { revision: event.etag } : {}),
    title: boundedText(event.summary)
      ? event.summary.slice(0, 240)
      : "Untitled event",
    startsAt,
    endsAt,
    allDay: Boolean(allDay),
    ...(event.status === "cancelled" ? { cancelled: true } : {}),
  };
}

function createGoogleCalendarConnector({ request, oauth } = {}) {
  const api = new URL(GOOGLE_CALENDAR_API);
  const call = async (path, init, override) => {
    const transport = override ?? request;
    if (typeof transport !== "function")
      throw new Error("A Google Calendar request implementation is required.");
    return transport(new URL(path, api).toString(), init);
  };
  const headers = (credential) => ({
    Authorization: `Bearer ${credential}`,
    Accept: "application/json",
  });
  const defaultOauth = {
    pkce: true,
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    // Ler e escrever eventos e listar calendários. O escopo `calendar` inteiro também daria
    // compartilhamento e permissões (ACL), que o Hibi não usa.
    scopes: [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
    ],
    authorizationParams: { access_type: "offline", prompt: "consent" },
  };
  return {
    id: "google-calendar",
    label: "Google Calendar",
    allowedHosts: [
      "www.googleapis.com",
      "accounts.google.com",
      "oauth2.googleapis.com",
    ],
    capabilities: ["import", "write", "sync"],
    ...(oauth === null
      ? {}
      : { oauth: oauth ? { ...defaultOauth, ...oauth } : defaultOauth }),
    async testConnection({ credential, request: override }) {
      const response = await call(
        "users/me/calendarList?maxResults=1",
        { method: "GET", headers: headers(credential) },
        override,
      );
      if (!response?.ok)
        throw failureFor(
          response,
          "Google Calendar rejected this authorization.",
        );
      return { ok: true, detail: "Google Calendar authorization accepted." };
    },
    async listImportTargets({ credential, request: override }) {
      const targets = [];
      let pageToken;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const query = new URLSearchParams({
          maxResults: String(MAX_PAGE_SIZE),
        });
        if (pageToken) query.set("pageToken", pageToken);
        const response = await call(
          `users/me/calendarList?${query.toString()}`,
          { method: "GET", headers: headers(credential) },
          override,
        );
        if (!response?.ok)
          throw failureFor(
            response,
            "Google Calendar could not list calendars.",
          );
        const body = await response.json().catch(() => ({}));
        for (const item of Array.isArray(body?.items) ? body.items : []) {
          if (!boundedText(item?.id)) continue;
          const label = boundedText(item?.summaryOverride)
            ? item.summaryOverride
            : boundedText(item?.summary)
              ? item.summary
              : item.id;
          targets.push({ id: item.id, label: label.slice(0, 240) });
        }
        pageToken = boundedText(body?.nextPageToken)
          ? body.nextPageToken
          : undefined;
        if (!pageToken) break;
      }
      return targets.slice(0, MAX_PAGE_SIZE * MAX_PAGES);
    },
    async fetchCalendarEvents({
      credential,
      calendarId,
      timeMin,
      timeMax,
      request: override,
    }) {
      if (!boundedText(calendarId))
        throw new Error("Google Calendar identifier is invalid.");
      const start = parseInstant(timeMin);
      const end = parseInstant(timeMax);
      if (
        !start ||
        !end ||
        end <= start ||
        end.getTime() - start.getTime() > MAX_RANGE_MS
      )
        throw new Error("Google Calendar time range is invalid.");
      const events = [];
      let pageToken;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const query = new URLSearchParams({
          singleEvents: "true",
          showDeleted: "true",
          maxResults: String(MAX_PAGE_SIZE),
          timeMin: start.toISOString(),
          timeMax: end.toISOString(),
        });
        if (pageToken) query.set("pageToken", pageToken);
        const response = await call(
          `calendars/${encodeURIComponent(calendarId)}/events?${query.toString()}`,
          { method: "GET", headers: headers(credential) },
          override,
        );
        if (!response?.ok)
          throw failureFor(response, "Google Calendar could not read events.");
        const body = await response.json().catch(() => ({}));
        for (const item of Array.isArray(body?.items) ? body.items : []) {
          const event = normalizeGoogleEvent(item);
          if (event) events.push(event);
        }
        pageToken = boundedText(body?.nextPageToken)
          ? body.nextPageToken
          : undefined;
        if (!pageToken) break;
      }
      return events;
    },
    // Um evento por id. 404 e 410 são resposta, não falha: o Google confirma que o evento não existe.
    async fetchCalendarEvent({ credential, calendarId, remoteId, request: override }) {
      if (!boundedText(calendarId) || !boundedText(remoteId, 1024))
        throw new Error("Google Calendar event identifier is invalid.");
      const response = await call(
        `calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(remoteId)}`,
        { method: "GET", headers: headers(credential) },
        override,
      );
      if (response?.status === 404 || response?.status === 410) return null;
      if (!response?.ok)
        throw failureFor(response, "Google Calendar could not read the event.");
      const event = normalizeGoogleEvent(await response.json().catch(() => ({})));
      if (!event) throw new Error("Google Calendar returned an invalid event.");
      return event;
    },
    prepareWrite({ kind, payload }) {
      if (kind === "calendar.create")
        return { kind, payload: prepareCalendarCreate(payload) };
      if (kind === "calendar.update")
        return { kind, payload: prepareCalendarUpdate(payload) };
      throw new Error("Google Calendar action is unsupported.");
    },
    async executeApproved({ kind, payload, credential, request: override }) {
      const event =
        kind === "calendar.create"
          ? prepareCalendarCreate(payload)
          : kind === "calendar.update"
            ? prepareCalendarUpdate(payload)
            : null;
      if (!event) throw new Error("Google Calendar action is unsupported.");
      const zone = event.timeZone ? { timeZone: event.timeZone } : {};
      const isUpdate = kind === "calendar.update";
      const body = {
        ...(!isUpdate && event.eventId ? { id: event.eventId } : {}),
        summary: event.title,
        ...(event.allDay
          ? allDayRange(event.startsAt, event.endsAt)
          : {
              start: { dateTime: event.startsAt, ...zone },
              end: { dateTime: event.endsAt, ...zone },
            }),
      };
      const calendarPath = `calendars/${encodeURIComponent(event.calendarId)}/events`;
      const path = isUpdate
        ? `${calendarPath}/${encodeURIComponent(event.remoteId)}`
        : calendarPath;
      const response = await call(
        path,
        {
          method: isUpdate ? "PATCH" : "POST",
          headers: {
            ...headers(credential),
            "Content-Type": "application/json",
            ...(isUpdate ? { "If-Match": event.expectedRevision } : {}),
          },
          body: JSON.stringify(body),
        },
        override,
      );
      if (response?.status === 412)
        throw new Error(
          "Google Calendar event changed elsewhere. Review the conflict.",
        );
      if (!isUpdate && event.eventId && response?.status === 409) {
        // O id já existe: é a publicação anterior, cuja gravação local falhou. Devolve esse evento em vez
        // de criar outro.
        const existing = await call(
          `${calendarPath}/${encodeURIComponent(event.eventId)}`,
          { method: "GET", headers: headers(credential) },
          override,
        );
        if (!existing?.ok)
          throw failureFor(existing, "Google Calendar could not confirm the existing event.");
        const found = await existing.json().catch(() => ({}));
        if (!boundedText(found?.id) || found.status === "cancelled")
          throw new Error("Google Calendar event identifier is already in use.");
        return {
          remoteId: found.id,
          ...(boundedText(found.etag) ? { revision: found.etag } : {}),
        };
      }
      if (!response?.ok)
        throw failureFor(
          response,
          `Google Calendar could not ${isUpdate ? "update" : "create"} the event.`,
        );
      const created = await response.json().catch(() => ({}));
      if (!boundedText(created?.id))
        throw new Error("Google Calendar returned an invalid event.");
      return {
        remoteId: created.id,
        ...(boundedText(created.etag) ? { revision: created.etag } : {}),
      };
    },
  };
}

module.exports = {
  GOOGLE_CALENDAR_API,
  createGoogleCalendarConnector,
  normalizeGoogleEvent,
};

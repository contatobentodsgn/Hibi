const test = require("node:test");
const assert = require("node:assert/strict");
const {
  GOOGLE_CALENDAR_API,
  createGoogleCalendarConnector,
} = require("./google-calendar.cjs");

test("lists Google calendars page by page without exposing credentials in its result", async () => {
  const calls = [];
  const connector = createGoogleCalendarConnector({
    request: async (url, init) => {
      calls.push({ url, init });
      return new Response(
        JSON.stringify({
          items:
            calls.length === 1
              ? [{ id: "primary", summary: "Work", accessRole: "owner" }]
              : [
                  {
                    id: "team@example.test",
                    summaryOverride: "Team",
                    accessRole: "reader",
                  },
                ],
          ...(calls.length === 1 ? { nextPageToken: "next page" } : {}),
        }),
        { status: 200 },
      );
    },
  });

  const targets = await connector.listImportTargets({
    credential: "secret-token",
  });

  assert.deepEqual(targets, [
    { id: "primary", label: "Work" },
    { id: "team@example.test", label: "Team" },
  ]);
  assert.equal(calls.length, 2);
  assert.equal(
    calls[0].url,
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250",
  );
  assert.equal(
    calls[1].url,
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250&pageToken=next+page",
  );
  assert.equal(calls[0].init.headers.Authorization, "Bearer secret-token");
  assert.equal(JSON.stringify(targets).includes("secret-token"), false);
});

test("reads selected Google Calendar events with a bounded time window", async () => {
  const calls = [];
  const connector = createGoogleCalendarConnector({
    request: async (url, init) => {
      calls.push({ url, init });
      return new Response(
        JSON.stringify({
          items: [
            {
              id: "meeting-1",
              etag: '"revision-1"',
              summary: "Client call",
              start: { dateTime: "2026-09-14T09:00:00-03:00" },
              end: { dateTime: "2026-09-14T10:00:00-03:00" },
            },
          ],
        }),
        { status: 200 },
      );
    },
  });

  const events = await connector.fetchCalendarEvents({
    credential: "secret-token",
    calendarId: "team@example.test",
    timeMin: "2026-09-14T00:00:00.000Z",
    timeMax: "2026-09-21T00:00:00.000Z",
  });

  assert.deepEqual(events, [
    {
      remoteId: "meeting-1",
      revision: '"revision-1"',
      title: "Client call",
      startsAt: "2026-09-14T09:00:00-03:00",
      endsAt: "2026-09-14T10:00:00-03:00",
      allDay: false,
    },
  ]);
  assert.match(calls[0].url, /calendars\/team%40example\.test\/events/);
  assert.match(calls[0].url, /timeMin=2026-09-14T00%3A00%3A00.000Z/);
  assert.equal(calls[0].init.method, "GET");
});

test("rejects an event range wider than 366 days before making a request", async () => {
  let requested = false;
  const connector = createGoogleCalendarConnector({
    request: async () => {
      requested = true;
      return new Response("{}");
    },
  });

  await assert.rejects(
    () =>
      connector.fetchCalendarEvents({
        credential: "secret-token",
        calendarId: "primary",
        timeMin: "2026-01-01T00:00:00.000Z",
        timeMax: "2027-01-03T00:00:00.000Z",
      }),
    /time range/i,
  );
  assert.equal(requested, false);
});

test("creates a Google Calendar event only through an approved calendar.create action", async () => {
  const calls = [];
  const connector = createGoogleCalendarConnector({
    request: async (url, init) => {
      calls.push({ url, init });
      return new Response(
        JSON.stringify({ id: "remote-event-1", etag: '"revision-1"' }),
        { status: 200 },
      );
    },
  });

  const prepared = connector.prepareWrite({
    kind: "calendar.create",
    payload: {
      calendarId: "primary",
      title: "Planejar semana",
      startsAt: "2026-09-14T09:00:00.000Z",
      endsAt: "2026-09-14T10:00:00.000Z",
      allDay: false,
    },
  });
  const result = await connector.executeApproved({
    kind: prepared.kind,
    payload: prepared.payload,
    credential: "secret-token",
  });

  assert.deepEqual(result, {
    ok: true,
    remoteId: "remote-event-1",
    revision: '"revision-1"',
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, "POST");
  assert.match(calls[0].url, /calendars\/primary\/events$/);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    summary: "Planejar semana",
    start: { dateTime: "2026-09-14T09:00:00.000Z" },
    end: { dateTime: "2026-09-14T10:00:00.000Z" },
  });
  assert.equal(calls[0].init.headers.Authorization, "Bearer secret-token");
});

test("updates an existing Google Calendar event with its expected revision", async () => {
  const calls = [];
  const connector = createGoogleCalendarConnector({
    request: async (url, init) => {
      calls.push({ url, init });
      return new Response(
        JSON.stringify({ id: "remote-event-1", etag: '"revision-2"' }),
        { status: 200 },
      );
    },
  });

  const prepared = connector.prepareWrite({
    kind: "calendar.update",
    payload: {
      calendarId: "primary",
      remoteId: "remote-event-1",
      expectedRevision: '"revision-1"',
      title: "Planejar revisão",
      startsAt: "2026-09-14T11:00:00.000Z",
      endsAt: "2026-09-14T12:00:00.000Z",
      allDay: false,
    },
  });
  const result = await connector.executeApproved({
    kind: prepared.kind,
    payload: prepared.payload,
    credential: "secret-token",
  });

  assert.deepEqual(result, {
    ok: true,
    remoteId: "remote-event-1",
    revision: '"revision-2"',
  });
  assert.equal(calls[0].init.method, "PATCH");
  assert.equal(calls[0].init.headers["If-Match"], '"revision-1"');
  assert.match(calls[0].url, /calendars\/primary\/events\/remote-event-1$/);
});

const okResponse = (body) => new Response(JSON.stringify(body), { status: 200 });

test("sends a timed event with its offset and the Mac's time zone, under the id Hibi chose", async () => {
  const calls = [];
  const connector = createGoogleCalendarConnector({
    request: async (url, init) => {
      calls.push({ url, init });
      return okResponse({ id: "0123456789abcdef0123456789abcdef", etag: '"r1"' });
    },
  });

  const prepared = connector.prepareWrite({
    kind: "calendar.create",
    payload: { calendarId: "primary", title: "Planejar", startsAt: "2026-09-15T09:00:00+14:00", endsAt: "2026-09-15T10:00:00+14:00", allDay: false, timeZone: "Pacific/Kiritimati", eventId: "0123456789abcdef0123456789abcdef" },
  });
  await connector.executeApproved({ kind: prepared.kind, payload: prepared.payload, credential: "secret-token" });

  assert.deepEqual(JSON.parse(calls[0].init.body), {
    id: "0123456789abcdef0123456789abcdef",
    summary: "Planejar",
    start: { dateTime: "2026-09-15T09:00:00+14:00", timeZone: "Pacific/Kiritimati" },
    end: { dateTime: "2026-09-15T10:00:00+14:00", timeZone: "Pacific/Kiritimati" },
  });
});

test("refuses a timed event without an offset, or a malformed zone or id, before any request", async () => {
  let requested = false;
  const connector = createGoogleCalendarConnector({ request: async () => { requested = true; return okResponse({}); } });
  const floating = { calendarId: "primary", title: "Planejar", startsAt: "2026-09-15T09:00:00", endsAt: "2026-09-15T10:00:00", allDay: false };

  assert.throws(() => connector.prepareWrite({ kind: "calendar.create", payload: floating }), /offset/);
  await assert.rejects(() => connector.executeApproved({ kind: "calendar.create", payload: floating, credential: "secret-token" }), /offset/);
  for (const bad of [{ timeZone: "Pacific/Kiritimati; drop" }, { eventId: "Has_Upper_Case" }, { eventId: "abc" }])
    assert.throws(() => connector.prepareWrite({ kind: "calendar.create", payload: { ...floating, startsAt: "2026-09-15T09:00:00Z", endsAt: "2026-09-15T10:00:00Z", ...bad } }), /invalid/);
  assert.equal(requested, false);
});

test("sends an all-day event with Google's exclusive end date", async () => {
  const bodies = [];
  const connector = createGoogleCalendarConnector({ request: async (_url, init) => { bodies.push(JSON.parse(init.body)); return okResponse({ id: "event" }); } });
  const cases = [
    ["2026-09-15T00:00:00-03:00", "2026-09-15T23:59:00-03:00", "2026-09-15", "2026-09-16"],
    ["2026-09-15T00:00:00-03:00", "2026-09-17T00:00:00-03:00", "2026-09-15", "2026-09-17"],
    ["2026-09-15T00:00:00-03:00", "2026-09-17T12:00:00-03:00", "2026-09-15", "2026-09-18"],
    ["2026-09-15", "2026-09-15T12:00:00Z", "2026-09-15", "2026-09-16"],
    ["2026-12-31T08:00:00+14:00", "2026-12-31T09:00:00+14:00", "2026-12-31", "2027-01-01"],
  ];

  for (const [startsAt, endsAt] of cases)
    await connector.executeApproved({ kind: "calendar.create", payload: { calendarId: "primary", title: "Dia inteiro", startsAt, endsAt, allDay: true }, credential: "secret-token" });

  assert.deepEqual(bodies.map((body) => [body.start.date, body.end.date]), cases.map(([, , start, end]) => [start, end]));
});

test("returns the event already created when a retried publish reuses its id", async () => {
  const calls = [];
  const connector = createGoogleCalendarConnector({
    request: async (url, init) => {
      calls.push(`${init.method} ${url.replace(GOOGLE_CALENDAR_API, "")}`);
      if (init.method === "POST") return new Response(JSON.stringify({ error: { code: 409 } }), { status: 409 });
      return okResponse({ id: "0123456789abcdef0123456789abcdef", etag: '"r1"', status: "confirmed" });
    },
  });

  const result = await connector.executeApproved({
    kind: "calendar.create",
    payload: { calendarId: "primary", title: "Planejar", startsAt: "2026-09-15T09:00:00-03:00", endsAt: "2026-09-15T10:00:00-03:00", allDay: false, eventId: "0123456789abcdef0123456789abcdef" },
    credential: "secret-token",
  });

  assert.deepEqual(result, { ok: true, remoteId: "0123456789abcdef0123456789abcdef", revision: '"r1"' });
  assert.deepEqual(calls, ["POST calendars/primary/events", "GET calendars/primary/events/0123456789abcdef0123456789abcdef"]);
});

test("asks Google only for event access and the calendar list", () => {
  assert.deepEqual(createGoogleCalendarConnector({}).oauth.scopes, [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  ]);
});

test("finds a single Google event by id and reports a deleted one as missing", async () => {
  const calls = [];
  const window = { start: { dateTime: "2026-09-23T09:00:00-03:00" }, end: { dateTime: "2026-09-23T10:00:00-03:00" } };
  const responses = {
    moved: () => okResponse({ id: "moved", etag: '"r2"', summary: "Movido", ...window }),
    gone: () => new Response("{}", { status: 404 }),
    purged: () => new Response("{}", { status: 410 }),
    cancelled: () => okResponse({ id: "cancelled", status: "cancelled", summary: "Cancelado", ...window }),
  };
  const connector = createGoogleCalendarConnector({
    request: async (url, init) => {
      calls.push(`${init.method} ${url.replace(GOOGLE_CALENDAR_API, "")}`);
      return responses[decodeURIComponent(url.split("/").pop())]();
    },
  });
  const find = (remoteId) => connector.fetchCalendarEvent({ credential: "secret-token", calendarId: "team@example.test", remoteId });

  assert.deepEqual(await find("moved"), { remoteId: "moved", revision: '"r2"', title: "Movido", startsAt: "2026-09-23T09:00:00-03:00", endsAt: "2026-09-23T10:00:00-03:00", allDay: false });
  assert.equal(await find("gone"), null);
  assert.equal(await find("purged"), null);
  assert.equal((await find("cancelled")).cancelled, true);
  assert.equal(calls[0], "GET calendars/team%40example.test/events/moved");
  await assert.rejects(() => find(""), /identifier is invalid/);
  assert.equal(calls.length, 4);
});

test("does not mistake an authorization or server failure for a deleted Google event", async () => {
  for (const [status, message] of [[401, /authorization expired/], [403, /denied access/], [500, /could not read the event/]]) {
    const connector = createGoogleCalendarConnector({ request: async () => new Response("{}", { status }) });
    await assert.rejects(() => connector.fetchCalendarEvent({ credential: "secret-token", calendarId: "primary", remoteId: "event-1" }), message);
  }
});

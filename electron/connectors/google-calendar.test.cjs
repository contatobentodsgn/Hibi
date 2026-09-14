const test = require('node:test');
const assert = require('node:assert/strict');
const { createGoogleCalendarConnector } = require('./google-calendar.cjs');

test('lists Google calendars page by page without exposing credentials in its result', async () => {
  const calls = [];
  const connector = createGoogleCalendarConnector({ request: async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({
      items: calls.length === 1
        ? [{ id: 'primary', summary: 'Work', accessRole: 'owner' }]
        : [{ id: 'team@example.test', summaryOverride: 'Team', accessRole: 'reader' }],
      ...(calls.length === 1 ? { nextPageToken: 'next page' } : {}),
    }), { status: 200 });
  } });

  const targets = await connector.listImportTargets({ credential: 'secret-token' });

  assert.deepEqual(targets, [
    { id: 'primary', label: 'Work' },
    { id: 'team@example.test', label: 'Team' },
  ]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250');
  assert.equal(calls[1].url, 'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250&pageToken=next+page');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer secret-token');
  assert.equal(JSON.stringify(targets).includes('secret-token'), false);
});

test('reads selected Google Calendar events with a bounded time window', async () => {
  const calls = [];
  const connector = createGoogleCalendarConnector({ request: async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ items: [{
      id: 'meeting-1', etag: '"revision-1"', summary: 'Client call',
      start: { dateTime: '2026-09-14T09:00:00-03:00' }, end: { dateTime: '2026-09-14T10:00:00-03:00' },
    }] }), { status: 200 });
  } });

  const events = await connector.fetchCalendarEvents({
    credential: 'secret-token',
    calendarId: 'team@example.test',
    timeMin: '2026-09-14T00:00:00.000Z',
    timeMax: '2026-09-21T00:00:00.000Z',
  });

  assert.deepEqual(events, [{
    remoteId: 'meeting-1', revision: '"revision-1"', title: 'Client call',
    startsAt: '2026-09-14T09:00:00-03:00', endsAt: '2026-09-14T10:00:00-03:00', allDay: false,
  }]);
  assert.match(calls[0].url, /calendars\/team%40example\.test\/events/);
  assert.match(calls[0].url, /timeMin=2026-09-14T00%3A00%3A00.000Z/);
  assert.equal(calls[0].init.method, 'GET');
});

test('rejects an event range wider than 366 days before making a request', async () => {
  let requested = false;
  const connector = createGoogleCalendarConnector({ request: async () => { requested = true; return new Response('{}'); } });

  await assert.rejects(() => connector.fetchCalendarEvents({
    credential: 'secret-token', calendarId: 'primary',
    timeMin: '2026-01-01T00:00:00.000Z', timeMax: '2027-01-03T00:00:00.000Z',
  }), /time range/i);
  assert.equal(requested, false);
});

test('creates a Google Calendar event only through an approved calendar.create action', async () => {
  const calls = [];
  const connector = createGoogleCalendarConnector({ request: async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ id: 'remote-event-1', etag: '"revision-1"' }), { status: 200 });
  } });

  const prepared = connector.prepareWrite({ kind: 'calendar.create', payload: { calendarId: 'primary', title: 'Planejar semana', startsAt: '2026-09-14T09:00:00.000Z', endsAt: '2026-09-14T10:00:00.000Z', allDay: false } });
  const result = await connector.executeApproved({ kind: prepared.kind, payload: prepared.payload, credential: 'secret-token' });

  assert.deepEqual(result, { remoteId: 'remote-event-1', revision: '"revision-1"' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, 'POST');
  assert.match(calls[0].url, /calendars\/primary\/events$/);
  assert.deepEqual(JSON.parse(calls[0].init.body), { summary: 'Planejar semana', start: { dateTime: '2026-09-14T09:00:00.000Z' }, end: { dateTime: '2026-09-14T10:00:00.000Z' } });
  assert.equal(calls[0].init.headers.Authorization, 'Bearer secret-token');
});

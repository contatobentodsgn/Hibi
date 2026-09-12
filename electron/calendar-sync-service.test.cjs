const test = require('node:test');
const assert = require('node:assert/strict');
const { createCalendarSyncService } = require('./calendar-sync-service.cjs');

test('reports only sanitized calendar source state and selected calendars', async () => {
  const eventKit = {
    available: () => true,
    authorizationStatus: () => 'full-access',
    listCalendars: () => [{ id: 'apple-1', label: 'Personal', sourceLabel: 'iCloud', writable: true }],
  };
  const integrations = {
    listStatus: async () => [{ id: 'google-calendar', state: 'connected' }],
    listImportTargets: async () => [{ id: 'primary', label: 'Work' }],
  };
  const settings = { get: () => ({ targets: [{ id: 'primary', label: 'Work' }] }) };
  const service = createCalendarSyncService({ eventKit, integrations, settings, now: () => '2026-09-12T12:00:00.000Z' });

  const state = await service.getState();

  assert.deepEqual(state, {
    sources: [
      { id: 'apple', provider: 'apple', label: 'Calendário do Mac', state: 'connected' },
      { id: 'google', provider: 'google', label: 'Google Calendar', state: 'connected' },
    ],
    calendars: [
      { id: 'apple:apple-1', sourceId: 'apple', label: 'Personal · iCloud', mode: 'read-only' },
      { id: 'google:primary', sourceId: 'google', label: 'Work', mode: 'read-only' },
    ],
    conflicts: [],
  });
});

test('asks EventKit for access before declaring the Mac calendar connected', async () => {
  let requested = false;
  const eventKit = { available: () => true, authorizationStatus: () => requested ? 'full-access' : 'not-determined', requestFullAccess: async () => { requested = true; }, listCalendars: () => [] };
  const service = createCalendarSyncService({ eventKit, integrations: { listStatus: async () => [] }, settings: { get: () => ({ targets: [] }) } });

  await service.requestAppleAccess();

  assert.equal(requested, true);
  assert.equal((await service.getState()).sources[0].state, 'connected');
});

test('reads selected Apple and Google events through one bounded serializable shape', async () => {
  const eventKit = {
    available: () => true,
    authorizationStatus: () => 'full-access',
    listCalendars: () => [],
    listEvents: ({ start, end, calendarIds }) => [{ id: 'apple-event', calendarId: calendarIds[0], title: 'Mac meeting', startsAt: start, endsAt: end, allDay: false, writable: true }],
  };
  const integrations = {
    listStatus: async () => [{ id: 'google-calendar', state: 'connected' }],
    listImportTargets: async () => [],
    readCalendarEvents: async (_id, input) => [{ remoteId: 'google-event', title: 'Google meeting', startsAt: input.timeMin, endsAt: input.timeMax, allDay: false }],
  };
  const service = createCalendarSyncService({ eventKit, integrations, settings: { get: () => ({ targets: [] }) } });

  const result = await service.readEvents({
    start: '2026-09-14T00:00:00.000Z', end: '2026-09-15T00:00:00.000Z',
    calendars: [{ sourceId: 'apple', id: 'apple:apple-cal' }, { sourceId: 'google', id: 'google:primary' }],
  });

  assert.deepEqual(result, [
    { sourceId: 'apple', calendarId: 'apple:apple-cal', remoteId: 'apple-event', title: 'Mac meeting', startsAt: '2026-09-14T00:00:00.000Z', endsAt: '2026-09-15T00:00:00.000Z', allDay: false, writable: true },
    { sourceId: 'google', calendarId: 'google:primary', remoteId: 'google-event', title: 'Google meeting', startsAt: '2026-09-14T00:00:00.000Z', endsAt: '2026-09-15T00:00:00.000Z', allDay: false, writable: false },
  ]);
});

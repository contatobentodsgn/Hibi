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

test('persists a per-calendar mode without enabling writes by default', async () => {
  let saved = null;
  let stored = { calendars: [{ id: 'apple:personal', mode: 'read-only' }] };
  const calendarSettings = {
    get: () => stored,
    save: (value) => { saved = value; stored = value; return value; },
  };
  const service = createCalendarSyncService({
    eventKit: { available: () => true, authorizationStatus: () => 'full-access', listCalendars: () => [{ id: 'personal', label: 'Pessoal', writable: true }] },
    integrations: { listStatus: async () => [] },
    settings: { get: () => ({ targets: [] }) },
    calendarSettings,
  });

  const state = await service.saveCalendarMode({ id: 'apple:personal', mode: 'bidirectional' });

  assert.deepEqual(saved, { calendars: [{ id: 'apple:personal', mode: 'bidirectional' }], sources: [] });
  assert.equal(state.calendars[0].mode, 'bidirectional');
});

test('does not publish a Hibi block until its matching confirmation is executed', async () => {
  const saved = [];
  const service = createCalendarSyncService({
    eventKit: { available: () => true, authorizationStatus: () => 'full-access', listCalendars: () => [{ id: 'personal', label: 'Pessoal', writable: true }], saveEvent: (event) => { saved.push(event); return { id: 'remote-1' }; } },
    integrations: { listStatus: async () => [] },
    settings: { get: () => ({ targets: [] }) },
    calendarSettings: { get: () => ({ calendars: [{ id: 'apple:personal', mode: 'bidirectional' }] }), save: () => undefined },
    randomId: () => 'fixed',
  });

  const prepared = await service.preparePublish({ calendarId: 'apple:personal', block: { id: 'block-1', title: 'Planejar semana', startsAt: '2026-09-14T09:00:00.000Z', endsAt: '2026-09-14T10:00:00.000Z' } });

  assert.equal(saved.length, 0);
  assert.deepEqual(prepared, { id: 'calendar-fixed', confirmationId: 'calendar-confirm-fixed', requiresConfirmation: true, calendarId: 'apple:personal', summary: 'Planejar semana' });
  assert.deepEqual(await service.executeApproved({ actionId: prepared.id, confirmationId: prepared.confirmationId }), { remoteId: 'remote-1' });
  assert.deepEqual(saved, [{ calendarId: 'personal', title: 'Planejar semana', start: '2026-09-14T09:00:00.000Z', end: '2026-09-14T10:00:00.000Z', allDay: false }]);
  await assert.rejects(() => service.executeApproved({ actionId: prepared.id, confirmationId: prepared.confirmationId }), /matching confirmation/);
});

test('delegates an approved Google publish through the integration confirmation contract', async () => {
  const prepared = [];
  const service = createCalendarSyncService({
    eventKit: { available: () => false, authorizationStatus: () => 'unavailable' },
    integrations: {
      listStatus: async () => [{ id: 'google-calendar', state: 'connected' }],
      prepareAction: async (input) => { prepared.push(input); return { id: 'google-action', confirmationId: 'google-confirm' }; },
      executeApproved: async (input) => ({ ok: input.actionId === 'google-action', remoteId: 'google-event' }),
    },
    settings: { get: () => ({ targets: [{ id: 'primary', label: 'Trabalho' }] }) },
    calendarSettings: { get: () => ({ calendars: [{ id: 'google:primary', mode: 'bidirectional' }] }), save: () => undefined },
  });

  const publication = await service.preparePublish({ calendarId: 'google:primary', block: { id: 'block-1', title: 'Reunião', startsAt: '2026-09-14T09:00:00.000Z', endsAt: '2026-09-14T10:00:00.000Z' } });

  assert.deepEqual(prepared, [{ connectorId: 'google-calendar', kind: 'calendar.create', payload: { calendarId: 'primary', title: 'Reunião', startsAt: '2026-09-14T09:00:00.000Z', endsAt: '2026-09-14T10:00:00.000Z', allDay: false } }]);
  assert.equal(publication.id, 'google-action');
  assert.deepEqual(await service.executeApproved({ actionId: publication.id, confirmationId: publication.confirmationId }), { remoteId: 'google-event' });
});

test('records the last successful read per source without persisting event details', async () => {
  let saved;
  const service = createCalendarSyncService({
    eventKit: { available: () => true, authorizationStatus: () => 'full-access', listCalendars: () => [], listEvents: () => [] },
    integrations: { listStatus: async () => [] },
    settings: { get: () => ({ targets: [] }) },
    calendarSettings: { get: () => ({ calendars: [], sources: [] }), save: (value) => { saved = value; } },
    now: () => '2026-09-14T11:00:00.000Z',
  });

  await service.readEvents({ start: '2026-09-14T00:00:00.000Z', end: '2026-09-15T00:00:00.000Z', calendars: [{ sourceId: 'apple', id: 'apple:personal' }] });

  assert.deepEqual(saved, { calendars: [], sources: [{ id: 'apple', lastSyncedAt: '2026-09-14T11:00:00.000Z' }] });
});

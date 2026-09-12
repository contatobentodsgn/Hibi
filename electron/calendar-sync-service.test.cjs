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

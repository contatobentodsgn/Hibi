const test = require('node:test');
const assert = require('node:assert/strict');
const { createNotificationScheduler, nextOccurrence } = require('./notifications.cjs');

function createHarness(start) {
  let now = Date.parse(start);
  let nextId = 1;
  const timers = new Map();
  const cleared = [];
  const shown = [];
  const scheduler = createNotificationScheduler({
    now: () => now,
    setTimeout: (callback, delay) => {
      const id = nextId++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (id) => {
      cleared.push(id);
      timers.delete(id);
    },
    NotificationClass: class FakeNotification {
      constructor(options) { shown.push(options); }
      show() {}
    },
  });
  return {
    scheduler,
    timers,
    cleared,
    shown,
    setNow: (value) => { now = Date.parse(value); },
    fireNext: () => {
      const [id, timer] = timers.entries().next().value;
      timers.delete(id);
      timer.callback();
    },
  };
}

test('shows a future one-time notification when its timer fires', () => {
  const harness = createHarness('2026-09-06T12:00:00-03:00');
  harness.scheduler.sync([{ id: 'deadline:1', kind: 'deadline', title: 'Deadline: Paper', body: 'Task deadline reached.', at: '2026-09-06T13:00:00-03:00' }]);

  assert.equal(harness.timers.size, 1);
  assert.equal([...harness.timers.values()][0].delay, 60 * 60 * 1000);
  harness.setNow('2026-09-06T13:00:00-03:00');
  harness.fireNext();

  assert.deepEqual(harness.shown, [{ title: 'Deadline: Paper', body: 'Task deadline reached.' }]);
  assert.equal(harness.timers.size, 0);
});

test('reschedules the next configured weekday after a recurring reminder fires', () => {
  const harness = createHarness('2026-09-07T12:00:00-03:00');
  harness.scheduler.sync([{
    id: 'reminder:weekly', kind: 'reminder', title: 'Language class', body: 'Important reminder.', at: '2026-09-08T09:00:00-03:00',
    recurrence: { frequency: 'weekly', weekdays: [2, 3], timesByWeekday: { 2: '09:00', 3: '20:00' }, startDate: '2026-09-07' },
  }]);

  assert.equal([...harness.timers.values()][0].delay, 21 * 60 * 60 * 1000);
  harness.setNow('2026-09-08T09:00:00-03:00');
  harness.fireNext();

  assert.equal(harness.shown.length, 1);
  assert.equal([...harness.timers.values()][0].delay, 35 * 60 * 60 * 1000);
});

test('accepts date-only recurrence values with the configured local offset', () => {
  const entry = { id: 'reminder:offset', kind: 'reminder', title: 'Offset', body: 'Offset', at: '2026-09-08T09:00:00-03:00', recurrence: { frequency: 'weekly', weekdays: [2], timesByWeekday: { 2: '09:00' }, startDate: '2026-09-07' } };
  assert.equal(Number.isFinite(nextOccurrence(entry, Date.parse('2026-09-07T08:00:00-03:00'))), true);
});

test('schedules the next day when a daily reminder time already passed', () => {
  const harness = createHarness('2026-09-07T10:00:00-03:00');
  harness.scheduler.sync([{ id: 'reminder:daily', kind: 'reminder', title: 'Daily check-in', body: 'Daily', at: '2026-09-07T09:00:00-03:00', recurrence: { frequency: 'daily', time: '09:00', startDate: '2026-09-07' } }]);

  assert.equal([...harness.timers.values()][0].delay, 23 * 60 * 60 * 1000);
});

test('sync clears timers from the previous snapshot', () => {
  const harness = createHarness('2026-09-06T12:00:00-03:00');
  harness.scheduler.sync([{ id: 'deadline:1', kind: 'deadline', title: 'Old', body: 'Old', at: '2026-09-06T13:00:00-03:00' }]);
  harness.scheduler.sync([]);

  assert.equal(harness.timers.size, 0);
  assert.equal(harness.cleared.length, 1);
});

test('keeps far-future one-time notifications alive across timer chunks', () => {
  const harness = createHarness('2026-09-06T12:00:00-03:00');
  harness.scheduler.sync([{ id: 'deadline:far', kind: 'deadline', title: 'Far deadline', body: 'Later', at: '2030-09-06T12:00:00-03:00' }]);

  assert.equal([...harness.timers.values()][0].delay, 2_147_000_000);
  harness.fireNext();

  assert.equal(harness.shown.length, 0);
  assert.equal(harness.timers.size, 1);
});

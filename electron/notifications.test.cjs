const test = require('node:test');
const assert = require('node:assert/strict');
const { createNotificationScheduler, nextOccurrence, sanitizeEntries } = require('./notifications.cjs');

// O agendador dispara no relógio de parede de quem usa o app: uma das 09:00 toca às 09:00 locais em
// qualquer fuso. Por isso todo "agora" e todo disparo esperado neste arquivo é montado com
// componentes locais. Ancorar qualquer um dos dois lados a um offset fixo esconderia exatamente o bug
// que estes testes guardam -- sob TZ=Pacific/Kiritimati ou TZ=Pacific/Midway, um instante `-03:00`
// fica horas longe das 09:00 que a pessoa vê no relógio.
function localMs(text) {
  const [date, time] = text.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0).getTime();
}

const reminder = { id: 'reminder:1', kind: 'reminder', title: 'Language class', body: 'Important reminder.' };

function createHarness(start, { onTrigger } = {}) {
  let now = start;
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
    onTrigger,
  });
  return {
    scheduler,
    timers,
    cleared,
    shown,
    setNow: (value) => { now = value; },
    fireNext: () => {
      const [id, timer] = timers.entries().next().value;
      timers.delete(id);
      timer.callback();
    },
  };
}

test('shows a future one-time notification when its timer fires', () => {
  const harness = createHarness(localMs('2026-09-06T12:00'));
  harness.scheduler.sync([{ id: 'deadline:1', kind: 'deadline', title: 'Deadline: Paper', body: 'Task deadline reached.', at: '2026-09-06T13:00:00-03:00' }]);

  assert.equal(harness.timers.size, 1);
  assert.equal([...harness.timers.values()][0].delay, 60 * 60 * 1000);
  harness.setNow(localMs('2026-09-06T13:00'));
  harness.fireNext();

  assert.deepEqual(harness.shown, [{ title: 'Deadline: Paper', body: 'Task deadline reached.' }]);
  assert.equal(harness.timers.size, 0);
});

test('reports the entry that triggered to the companion bridge', () => {
  const triggered = []; const harness = createHarness(localMs('2026-09-06T12:00'), { onTrigger: (entry) => triggered.push(entry.id) });
  harness.scheduler.sync([{ ...reminder, at: '2026-09-06T13:00:00-03:00' }]);
  harness.setNow(localMs('2026-09-06T13:00')); harness.fireNext();
  assert.deepEqual(triggered, ['reminder:1']);
});

test('fires a one-time reminder at the local 09:00, not at the offset it was stored with', () => {
  const entry = { ...reminder, at: '2026-09-11T09:00:00-03:00' };
  assert.equal(nextOccurrence(entry, localMs('2026-09-11T08:00')), localMs('2026-09-11T09:00'));
});

test('a reminder at 09:00 lands on the same clock face whether or not it repeats', () => {
  const at = '2026-09-11T09:00:00-03:00';
  const once = { ...reminder, id: 'reminder:once', at };
  const daily = { ...reminder, id: 'reminder:daily', at, recurrence: { frequency: 'daily', startDate: '2026-09-11' } };
  const before = localMs('2026-09-11T08:00');

  assert.equal(nextOccurrence(once, before), nextOccurrence(daily, before));
  assert.equal(nextOccurrence(once, before), localMs('2026-09-11T09:00'));
});

// A gravação do `at` é corrigida em outro PR, então o módulo recebe as três formas ao mesmo tempo.
// Como ele lê os dígitos, o sufixo não pode mudar o disparo.
test('reads the digits, so -03:00, Z, and a bare timestamp fire at the same moment', () => {
  const after = localMs('2026-09-11T08:00');
  const expected = localMs('2026-09-11T09:00');

  for (const at of ['2026-09-11T09:00:00-03:00', '2026-09-11T09:00:00Z', '2026-09-11T09:00:00.000Z', '2026-09-11T09:00:00+09:00', '2026-09-11T09:00:00', '2026-09-11T09:00']) {
    assert.equal(nextOccurrence({ ...reminder, at }, after), expected, at);
  }
});

test('the suffix does not move a recurring reminder either', () => {
  const after = localMs('2026-09-11T08:00');
  const expected = localMs('2026-09-11T09:00');

  for (const at of ['2026-09-11T09:00:00-03:00', '2026-09-11T09:00:00Z', '2026-09-11T09:00:00']) {
    const entry = { ...reminder, at, recurrence: { frequency: 'daily', startDate: '2026-09-11' } };
    assert.equal(nextOccurrence(entry, after), expected, at);
  }
});

test('reschedules the next configured weekday after a recurring reminder fires', () => {
  const harness = createHarness(localMs('2026-09-07T12:00'));
  harness.scheduler.sync([{
    ...reminder, id: 'reminder:weekly', at: '2026-09-08T09:00:00-03:00',
    recurrence: { frequency: 'weekly', weekdays: [2, 3], timesByWeekday: { 2: '09:00', 3: '20:00' }, startDate: '2026-09-07' },
  }]);

  assert.equal([...harness.timers.values()][0].delay, 21 * 60 * 60 * 1000);
  harness.setNow(localMs('2026-09-08T09:00'));
  harness.fireNext();

  assert.equal(harness.shown.length, 1);
  assert.equal([...harness.timers.values()][0].delay, 35 * 60 * 60 * 1000);
});

test('accepts date-only recurrence values and resolves them on the local calendar', () => {
  const entry = { ...reminder, id: 'reminder:offset', at: '2026-09-08T09:00:00-03:00', recurrence: { frequency: 'weekly', weekdays: [2], timesByWeekday: { 2: '09:00' }, startDate: '2026-09-07' } };
  assert.equal(nextOccurrence(entry, localMs('2026-09-07T08:00')), localMs('2026-09-08T09:00'));
});

// `startDate` era comparado como um instante de São Paulo contra a meia-noite local, então fora de
// UTC-03 o ramo escolhido escorregava um dia e a série começava cedo demais.
test('picks the recurrence start day on the local calendar, never a day early', () => {
  const entry = { ...reminder, at: '2026-09-11T09:00:00-03:00', recurrence: { frequency: 'daily', time: '09:00', startDate: '2026-09-12' } };
  assert.equal(nextOccurrence(entry, localMs('2026-09-10T10:00')), localMs('2026-09-12T09:00'));
});

test('honours a weekly start day on the local calendar', () => {
  const entry = { ...reminder, at: '2026-09-15T09:00:00-03:00', recurrence: { frequency: 'weekly', weekdays: [2], time: '09:00', startDate: '2026-09-15' } };
  assert.equal(nextOccurrence(entry, localMs('2026-09-13T10:00')), localMs('2026-09-15T09:00'));
});

test('schedules the next day when a daily reminder time already passed', () => {
  const harness = createHarness(localMs('2026-09-07T10:00'));
  harness.scheduler.sync([{ ...reminder, id: 'reminder:daily', title: 'Daily check-in', body: 'Daily', at: '2026-09-07T09:00:00-03:00', recurrence: { frequency: 'daily', time: '09:00', startDate: '2026-09-07' } }]);

  assert.equal([...harness.timers.values()][0].delay, 23 * 60 * 60 * 1000);
});

test('keeps a late-night reminder on its own day', () => {
  const entry = { ...reminder, at: '2026-09-11T23:59:00-03:00' };
  assert.equal(nextOccurrence(entry, localMs('2026-09-11T23:00')), localMs('2026-09-11T23:59'));
});

test('keeps a just-after-midnight reminder on its own day', () => {
  const entry = { ...reminder, at: '2026-09-12T00:01:00-03:00' };
  assert.equal(nextOccurrence(entry, localMs('2026-09-11T23:59')), localMs('2026-09-12T00:01'));
});

test('rolls a daily reminder over midnight without skipping a day', () => {
  const entry = { ...reminder, at: '2026-09-11T23:59:00-03:00', recurrence: { frequency: 'daily', time: '23:59', startDate: '2026-09-11' } };
  assert.equal(nextOccurrence(entry, localMs('2026-09-11T23:59')), localMs('2026-09-12T23:59'));
});

test('treats a deadline stored without a time of day as the start of its local day', () => {
  const entry = { id: 'deadline:dateonly', kind: 'deadline', title: 'Deadline: Paper', body: 'Task deadline reached.', at: '2026-09-11' };
  assert.equal(nextOccurrence(entry, localMs('2026-09-10T12:00')), localMs('2026-09-11T00:00'));
  assert.equal(sanitizeEntries([entry]).length, 1);
});

test('sync clears timers from the previous snapshot', () => {
  const harness = createHarness(localMs('2026-09-06T12:00'));
  harness.scheduler.sync([{ id: 'deadline:1', kind: 'deadline', title: 'Old', body: 'Old', at: '2026-09-06T13:00:00-03:00' }]);
  harness.scheduler.sync([]);

  assert.equal(harness.timers.size, 0);
  assert.equal(harness.cleared.length, 1);
});

test('keeps far-future one-time notifications alive across timer chunks', () => {
  const harness = createHarness(localMs('2026-09-06T12:00'));
  harness.scheduler.sync([{ id: 'deadline:far', kind: 'deadline', title: 'Far deadline', body: 'Later', at: '2030-09-06T12:00:00-03:00' }]);

  assert.equal([...harness.timers.values()][0].delay, 2_147_000_000);
  harness.fireNext();

  assert.equal(harness.shown.length, 0);
  assert.equal(harness.timers.size, 1);
});

test('keeps valid reminders while dropping entries with overlong fields', () => {
  const valid = { id: 'reminder:valid', kind: 'reminder', title: 'Valid', body: 'Keep me', at: '2026-09-07T09:00:00-03:00' };
  const entries = [
    valid,
    { ...valid, id: 'x'.repeat(129) },
    { ...valid, title: 'x'.repeat(501) },
    { ...valid, body: 'x'.repeat(501) },
  ];

  assert.deepEqual(sanitizeEntries(entries), [{ ...valid, recurrence: null }]);
});

test('drops entries whose day never existed on the calendar', () => {
  const valid = { id: 'reminder:valid', kind: 'reminder', title: 'Valid', body: 'Keep me', at: '2026-09-07T09:00:00-03:00' };

  for (const at of ['2026-02-31T09:00:00-03:00', '2026-02-29T09:00:00-03:00', '2026-13-01T09:00:00-03:00', '2026-09-00T09:00:00-03:00']) {
    assert.deepEqual(sanitizeEntries([{ ...valid, at }]), [], at);
  }
  assert.equal(sanitizeEntries([{ ...valid, at: '2028-02-29T09:00:00-03:00' }]).length, 1);
});

test('drops entries whose time of day is malformed', () => {
  const valid = { id: 'reminder:valid', kind: 'reminder', title: 'Valid', body: 'Keep me', at: '2026-09-07T09:00:00-03:00' };

  for (const at of ['2026-09-07T25:00:00-03:00', '2026-09-07T09:70:00-03:00', '2026-09-07T9:00', '2026-09-07 09:00', 'not-a-date', '', '2026-09-07T']) {
    assert.deepEqual(sanitizeEntries([{ ...valid, at }]), [], JSON.stringify(at));
  }
});

test('drops a recurrence whose start day never existed', () => {
  const valid = { id: 'reminder:valid', kind: 'reminder', title: 'Valid', body: 'Keep me', at: '2026-09-07T09:00:00-03:00' };
  assert.deepEqual(sanitizeEntries([{ ...valid, recurrence: { frequency: 'daily', time: '09:00', startDate: '2026-02-31' } }]), []);
});

test('limits the notification batch without discarding valid entries within the bound', () => {
  const valid = { id: 'reminder:valid', kind: 'reminder', title: 'Valid', body: 'Keep me', at: '2026-09-07T09:00:00-03:00' };
  const entries = Array.from({ length: 1001 }, (_, index) => ({ ...valid, id: `reminder:${index}` }));

  assert.equal(sanitizeEntries(entries).length, 1000);
  assert.equal(sanitizeEntries(entries).at(-1).id, 'reminder:999');
});

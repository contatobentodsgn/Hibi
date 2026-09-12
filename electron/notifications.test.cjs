const test = require('node:test');
const assert = require('node:assert/strict');
const { createNotificationScheduler, nextOccurrence, sanitizeEntries } = require('./notifications.cjs');
const { DEFAULT_FOCUS_SETTINGS, countDailyAlerts } = require('./focus-gate.cjs');

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

// --- O portão de foco, provado no agendador -------------------------------------------------------
// A tela de Foco sempre prometeu que lembretes ficam quietos durante a sessão. Até aqui nada cumpria:
// o agendador não tinha noção nenhuma de foco. Estes testes são a prova de que a frase virou verdade.

const wellbeing = { id: 'reminder:water', kind: 'reminder', category: 'wellbeing', title: 'Beber água', body: 'Wellbeing reminder.' };

test('um lembrete de bem-estar que vence no meio da sessão não dispara durante — e dispara depois', () => {
  const harness = createHarness(localMs('2026-09-11T14:00'));
  harness.scheduler.sync([{ ...wellbeing, at: '2026-09-11T14:10:00' }], { focusUntilMs: localMs('2026-09-11T14:25') });

  // Armado para o fim da sessão (25 min), não para as 14:10 em que venceria.
  assert.equal([...harness.timers.values()][0].delay, 25 * 60 * 1000);

  // No instante em que venceria, nada sai.
  harness.setNow(localMs('2026-09-11T14:10'));
  harness.fireNext();
  assert.deepEqual(harness.shown, []);

  // Terminada a sessão, sai.
  harness.setNow(localMs('2026-09-11T14:25'));
  harness.fireNext();
  assert.equal(harness.shown.length, 1);
});

// Silenciar é adiar, não descartar: sem o registro de adiamento, `nextOccurrence` descartaria uma
// ocorrência já vencida no sync seguinte e o lembrete sumiria para sempre.
test('encerrar a sessão mais cedo entrega o lembrete retido em vez de perdê-lo', () => {
  const harness = createHarness(localMs('2026-09-11T14:00'));
  const entries = [{ ...wellbeing, at: '2026-09-11T14:10:00' }];
  harness.scheduler.sync(entries, { focusUntilMs: localMs('2026-09-11T14:25') });

  harness.setNow(localMs('2026-09-11T14:15'));
  harness.scheduler.sync(entries, { focusUntilMs: null });

  assert.equal([...harness.timers.values()][0].delay, 1, 'entrega imediata, porque já venceu');
  harness.fireNext();
  assert.equal(harness.shown.length, 1);
});

test('um lembrete importante dispara na hora, com a sessão em andamento', () => {
  const harness = createHarness(localMs('2026-09-11T14:00'));
  harness.scheduler.sync([{ ...wellbeing, id: 'reminder:call', category: 'important', at: '2026-09-11T14:10:00' }], { focusUntilMs: localMs('2026-09-11T14:25') });

  assert.equal([...harness.timers.values()][0].delay, 10 * 60 * 1000);
  harness.setNow(localMs('2026-09-11T14:10'));
  harness.fireNext();
  assert.equal(harness.shown.length, 1);
});

test('nada não importante dispara fora do horário ativo', () => {
  const harness = createHarness(localMs('2026-09-11T21:00'));
  harness.scheduler.sync([{ ...wellbeing, at: '2026-09-11T22:00:00' }], {});

  harness.setNow(localMs('2026-09-11T22:00'));
  harness.fireNext();
  assert.deepEqual(harness.shown, [], '22:00 está fora de 09:00–17:00');

  harness.setNow(localMs('2026-09-12T09:00'));
  harness.fireNext();
  assert.equal(harness.shown.length, 1, 'sai na abertura do horário ativo seguinte');
});

// Roda o dia inteiro no agendador, disparando os timers em ordem cronológica real.
function simulateDay(entries, context, dayStartMs, dayEndMs) {
  let now = dayStartMs;
  const shown = [];
  const timers = new Map();
  let nextId = 1;
  const scheduler = createNotificationScheduler({
    now: () => now,
    setTimeout: (callback, delay) => { const id = nextId++; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    NotificationClass: class { constructor(options) { shown.push({ ...options, at: now }); } show() {} },
  });
  scheduler.sync(entries, context);
  for (let guard = 0; guard < 500; guard += 1) {
    let chosenId = null;
    let chosen = null;
    for (const [id, timer] of timers) if (chosen === null || timer.at < chosen.at) { chosen = timer; chosenId = id; }
    if (chosen === null || chosen.at >= dayEndMs) break;
    timers.delete(chosenId);
    now = chosen.at;
    chosen.callback();
  }
  return shown;
}

// A prévia mostrada em Ajustes NÃO é uma estimativa paralela: ela chama `nextDelivery`, a mesma
// função que arma cada timer. Uma prévia que pudesse discordar da realidade é exatamente como
// "09:00–17:00" virou enfeite no app original. Este teste prende a igualdade.
test('a prévia de alertas por dia e o portão são a mesma função: os números batem', () => {
  const daily = (id, time, category) => ({
    id, kind: 'reminder', category, title: id, body: 'Reminder.',
    at: `2026-09-11T${time}:00`, recurrence: { frequency: 'daily', time, startDate: '2026-09-11' },
  });
  const entries = sanitizeEntries([
    daily('reminder:dawn', '07:30', 'wellbeing'),
    daily('reminder:noon', '12:00', 'wellbeing'),
    daily('reminder:noonish', '12:10', 'wellbeing'),
    daily('reminder:night', '22:00', 'wellbeing'),
    daily('reminder:class', '13:00', 'important'),
  ]);
  const dayStartMs = localMs('2026-09-11T00:00');
  const dayEndMs = localMs('2026-09-12T00:00');

  const predicted = countDailyAlerts({ entries, settings: DEFAULT_FOCUS_SETTINGS, dayStartMs, nextOccurrence });
  const actual = simulateDay(entries, { settings: DEFAULT_FOCUS_SETTINGS }, dayStartMs, dayEndMs);

  assert.equal(actual.length, predicted);
  // E a contagem é mesmo o efeito do portão, não um empate trivial em zero.
  assert.ok(predicted > 0 && predicted < entries.length, `previu ${predicted} de ${entries.length} lembretes`);
});

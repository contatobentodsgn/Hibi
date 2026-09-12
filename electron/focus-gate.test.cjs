const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_FOCUS_SETTINGS, NUDGE_PRESETS, isExempt, nextDelivery, sanitizeFocusSettings, sanitizeFocusUntil, withinActiveHours } = require('./focus-gate.mjs');

// O portão decide em hora de parede local, como todo o resto do app. Por isso todo instante aqui é
// montado com componentes locais: ancorar qualquer lado a um offset fixo esconderia justamente o bug
// que estes testes guardam. A suíte roda também sob TZ=Pacific/Kiritimati (UTC+14) e
// TZ=Pacific/Midway (UTC-11), onde um valor derivado de toISOString() cairia no dia errado.
function localMs(text) {
  const [date, time] = text.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0).getTime();
}

const settings = DEFAULT_FOCUS_SETTINGS;
const nudge = { kind: 'reminder', category: 'wellbeing' };
const important = { kind: 'reminder', category: 'important' };
const deadline = { kind: 'deadline' };

test('o padrão é uma sessão de 25 minutos e um horário ativo de 09:00 às 17:00', () => {
  assert.equal(DEFAULT_FOCUS_SETTINGS.sessionMinutes, 25);
  assert.equal(DEFAULT_FOCUS_SETTINGS.activeStart, '09:00');
  assert.equal(DEFAULT_FOCUS_SETTINGS.activeEnd, '17:00');
});

test('um lembrete importante e um prazo atravessam o foco na hora marcada', () => {
  const at = localMs('2026-09-11T14:10');
  const context = { settings, focusUntilMs: localMs('2026-09-11T14:25') };

  assert.equal(nextDelivery(important, at, context), at);
  assert.equal(nextDelivery(deadline, at, context), at);
  assert.ok(isExempt(important) && isExempt(deadline));
});

// Diante da dúvida o portão avisa: um alerta a mais incomoda, um a menos perde o compromisso.
test('uma entrada sem categoria atravessa o portão em vez de ser engolida', () => {
  const at = localMs('2026-09-11T22:00');
  const uncategorized = { kind: 'reminder' };

  assert.ok(isExempt(uncategorized));
  assert.equal(nextDelivery(uncategorized, at, { settings, focusUntilMs: localMs('2026-09-11T23:00') }), at);
});

test('um lembrete de bem-estar que vence durante a sessão sai quando a sessão termina', () => {
  const at = localMs('2026-09-11T14:10');
  const delivered = nextDelivery(nudge, at, { settings, focusUntilMs: localMs('2026-09-11T14:25') });

  assert.equal(delivered, localMs('2026-09-11T14:25'));
  assert.ok(delivered > at, 'adiado, nunca descartado');
});

test('um lembrete que vence antes do horário ativo espera a abertura do mesmo dia', () => {
  assert.equal(nextDelivery(nudge, localMs('2026-09-11T07:30'), { settings }), localMs('2026-09-11T09:00'));
});

test('um lembrete que vence depois do horário ativo espera a abertura do dia seguinte', () => {
  assert.equal(nextDelivery(nudge, localMs('2026-09-11T22:00'), { settings }), localMs('2026-09-12T09:00'));
});

test('nada não importante sai fora do horário ativo, e o importante sai', () => {
  for (const at of ['2026-09-11T03:00', '2026-09-11T08:59', '2026-09-11T17:00', '2026-09-11T23:59']) {
    const delivered = nextDelivery(nudge, localMs(at), { settings });
    const hour = new Date(delivered).getHours();
    assert.ok(hour >= 9 && hour < 17, `${at} saiu às ${hour}h`);
    assert.equal(nextDelivery(important, localMs(at), { settings }), localMs(at), at);
  }
});

test('uma sessão que termina fora do horário ativo empurra o lembrete para a próxima abertura', () => {
  const delivered = nextDelivery(nudge, localMs('2026-09-11T16:50'), { settings, focusUntilMs: localMs('2026-09-11T17:30') });
  assert.equal(delivered, localMs('2026-09-12T09:00'));
});

test('o preset separa dois nudges pelo intervalo mínimo', () => {
  const last = localMs('2026-09-11T10:00');
  const at = localMs('2026-09-11T10:05');

  assert.equal(nextDelivery(nudge, at, { settings, lastNudgeAtMs: last }), localMs('2026-09-11T10:45'));
  assert.equal(nextDelivery(nudge, at, { settings: { ...settings, nudgePreset: 'calm' }, lastNudgeAtMs: last }), localMs('2026-09-11T11:30'));
  assert.equal(nextDelivery(nudge, at, { settings: { ...settings, nudgePreset: 'wellbeing' }, lastNudgeAtMs: last }), localMs('2026-09-11T10:15'));
});

test('o intervalo do preset nunca puxa um alerta para antes da hora em que ele venceu', () => {
  const at = localMs('2026-09-11T15:00');
  assert.equal(nextDelivery(nudge, at, { settings, lastNudgeAtMs: localMs('2026-09-11T09:00') }), at);
});

test('o intervalo do preset não atrasa um lembrete importante', () => {
  const at = localMs('2026-09-11T10:05');
  assert.equal(nextDelivery(important, at, { settings, lastNudgeAtMs: localMs('2026-09-11T10:00') }), at);
});

test('os presets são três intenções nomeadas, não um campo de intervalo cru', () => {
  assert.deepEqual(Object.keys(NUDGE_PRESETS).sort(), ['calm', 'wellbeing', 'work']);
  assert.ok(NUDGE_PRESETS.calm > NUDGE_PRESETS.work && NUDGE_PRESETS.work > NUDGE_PRESETS.wellbeing);
});

test('withinActiveHours devolve o próprio instante quando ele já está dentro da janela', () => {
  const at = localMs('2026-09-11T12:00');
  assert.equal(withinActiveHours(at, settings), at);
});

test('um ajuste corrompido cai no padrão em vez de silenciar o app', () => {
  assert.deepEqual(sanitizeFocusSettings(undefined), DEFAULT_FOCUS_SETTINGS);
  assert.deepEqual(sanitizeFocusSettings({ sessionMinutes: 9999, nudgePreset: 'nope', activeStart: '25:00', activeEnd: 'x' }), DEFAULT_FOCUS_SETTINGS);
  assert.equal(sanitizeFocusSettings({ sessionMinutes: 50 }).sessionMinutes, 50);
});

test('uma janela invertida ou vazia volta ao padrão, para nunca silenciar o dia inteiro', () => {
  assert.equal(sanitizeFocusSettings({ activeStart: '18:00', activeEnd: '09:00' }).activeStart, '09:00');
  assert.equal(sanitizeFocusSettings({ activeStart: '12:00', activeEnd: '12:00' }).activeEnd, '17:00');
});

test('uma janela de foco inválida vira "sem foco", nunca um portão fechado para sempre', () => {
  assert.equal(sanitizeFocusUntil('amanhã'), null);
  assert.equal(sanitizeFocusUntil(Number.NaN), null);
  assert.equal(sanitizeFocusUntil(1234), 1234);
});

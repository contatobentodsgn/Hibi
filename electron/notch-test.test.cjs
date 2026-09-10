const assert = require('node:assert/strict');
const test = require('node:test');
const { createNotchTest } = require('./notch-test.cjs');

const flush = () => new Promise((resolve) => setImmediate(resolve));
function fakeTimers() {
  const list = [];
  return {
    list,
    setTimer: (fn, ms) => { list.push({ fn, ms, cleared: false }); return list.length - 1; },
    clearTimer: (id) => { if (list[id]) list[id].cleared = true; },
    fire: (index) => { if (!list[index].cleared) list[index].fn(); },
  };
}
function fakeManager() {
  const shown = [];
  const hidden = [];
  let active = null;
  return {
    shown,
    hidden,
    get activeInteractive() { return Boolean(active && active.actions.length > 0); },
    describeDisplays: () => ({ resolvedDisplayId: 2, reason: 'preferred', displays: [{ id: 2, label: 'LG ULTRAWIDE', primary: true, internal: false, hasCameraHousing: false, width: 2560, height: 1080 }] }),
    show(presentation) { shown.push(presentation); active = presentation; return { degraded: false, requestId: presentation.requestId }; },
    hide(requestId) { hidden.push(requestId); if (active?.requestId !== requestId) return false; active = null; return true; },
    // Outra apresentação do app ocupa o notch no meio do teste.
    replace(presentation) { active = presentation; },
  };
}
const setup = () => {
  const timers = fakeTimers();
  const manager = fakeManager();
  const notchTest = createNotchTest({ manager, setTimer: timers.setTimer, clearTimer: timers.clearTimer });
  return { timers, manager, notchTest };
};

test('mostra o cartão passivo, depois a confirmação, e devolve confirmed', async () => {
  const { timers, manager, notchTest } = setup();
  const running = notchTest.run('pt');
  await flush();

  assert.deepEqual(manager.shown[0], { requestId: 'notch-test-passive-1', kind: 'result', text: 'Teste do notch', actions: [], interaction: 'passthrough' });
  assert.equal(timers.list[0].ms, 2_500);
  timers.fire(0);
  await flush();

  assert.deepEqual(manager.hidden, ['notch-test-passive-1']);
  assert.deepEqual(manager.shown[1], { requestId: 'notch-test-confirm-1', kind: 'confirmation', text: 'Este cartão apareceu no monitor escolhido?', actions: [{ id: 'confirm', label: 'Apareceu' }, { id: 'cancel', label: 'Não apareceu' }], interaction: 'capture' });
  assert.equal(timers.list[1].ms, 20_000);

  assert.equal(notchTest.handleAction({ requestId: 'notch-test-confirm-1', actionId: 'confirm' }), true);
  assert.deepEqual(await running, { outcome: 'confirmed', displayId: 2, displayLabel: 'LG ULTRAWIDE' });
  assert.equal(timers.list[1].cleared, true);
});

test('cancelar devolve declined, com os textos em inglês', async () => {
  const { timers, manager, notchTest } = setup();
  const running = notchTest.run('en');
  await flush();
  assert.equal(manager.shown[0].text, 'Notch test');
  timers.fire(0);
  await flush();
  assert.deepEqual(manager.shown[1].actions, [{ id: 'confirm', label: 'It appeared' }, { id: 'cancel', label: 'It did not appear' }]);

  notchTest.handleAction({ requestId: 'notch-test-confirm-1', actionId: 'cancel' });
  assert.equal((await running).outcome, 'declined');
});

test('idioma desconhecido usa português', async () => {
  const { manager, notchTest } = setup();
  void notchTest.run('xx');
  await flush();
  assert.equal(manager.shown[0].text, 'Teste do notch');
});

test('sem resposta, esconde a confirmação e devolve timeout', async () => {
  const { timers, manager, notchTest } = setup();
  const running = notchTest.run('pt');
  await flush();
  timers.fire(0);
  await flush();
  timers.fire(1);

  assert.equal((await running).outcome, 'timeout');
  assert.deepEqual(manager.hidden, ['notch-test-passive-1', 'notch-test-confirm-1']);
});

test('outra apresentação durante o cartão passivo interrompe o teste sem mostrar a confirmação', async () => {
  const { timers, manager, notchTest } = setup();
  const running = notchTest.run('pt');
  await flush();
  manager.replace({ requestId: 'reminder-1', kind: 'result', text: 'Lembrete', actions: [] });
  timers.fire(0);

  assert.equal((await running).outcome, 'interrupted');
  assert.equal(manager.shown.length, 1);
});

test('outra apresentação durante a confirmação interrompe o teste', async () => {
  const { timers, manager, notchTest } = setup();
  const running = notchTest.run('pt');
  await flush();
  timers.fire(0);
  await flush();
  manager.replace({ requestId: 'reminder-2', kind: 'result', text: 'Lembrete', actions: [] });
  timers.fire(1);

  assert.equal((await running).outcome, 'interrupted');
});

test('não tampa uma confirmação real pendente nem roda dois testes ao mesmo tempo', async () => {
  const { manager, notchTest } = setup();
  manager.replace({ requestId: 'notion-sync', kind: 'confirmation', text: 'Aplicar?', actions: [{ id: 'confirm', label: 'Confirmar' }] });
  assert.deepEqual(await notchTest.run('pt'), { outcome: 'busy', displayId: null, displayLabel: '' });
  assert.equal(manager.shown.length, 0);

  const other = setup();
  void other.notchTest.run('pt');
  await flush();
  assert.equal((await other.notchTest.run('pt')).outcome, 'busy');
  assert.equal(other.manager.shown.length, 1);
});

test('uma falha do gerenciador devolve failed e libera um novo teste', async () => {
  const timers = fakeTimers();
  const manager = { ...fakeManager(), activeInteractive: false, describeDisplays: () => { throw new Error('sem telas'); } };
  const notchTest = createNotchTest({ manager, setTimer: timers.setTimer, clearTimer: timers.clearTimer });

  assert.deepEqual(await notchTest.run('pt'), { outcome: 'failed', displayId: null, displayLabel: '' });
  assert.deepEqual(await notchTest.run('pt'), { outcome: 'failed', displayId: null, displayLabel: '' });
});

test('show da confirmação falhando depois do timer de resposta já registrado não deixa timer solto', async () => {
  const timers = fakeTimers();
  const manager = fakeManager();
  let showCount = 0;
  const originalShow = manager.show.bind(manager);
  manager.show = (presentation) => {
    showCount += 1;
    if (showCount === 2) throw new Error('falha ao mostrar a confirmação');
    return originalShow(presentation);
  };
  const notchTest = createNotchTest({ manager, setTimer: timers.setTimer, clearTimer: timers.clearTimer });

  const running = notchTest.run('pt');
  await flush();
  timers.fire(0);
  await flush();

  assert.deepEqual(await running, { outcome: 'failed', displayId: null, displayLabel: '' });
  // O timer de resposta (índice 1) foi registrado antes do `show` falhar; precisa ter sido cancelado.
  assert.equal(timers.list[1].cleared, true);
});

test('handleAction só assume as ações do teste', async () => {
  const { notchTest } = setup();
  assert.equal(notchTest.handleAction({ requestId: 'notion-sync', actionId: 'confirm' }), false);
  assert.equal(notchTest.handleAction({ requestId: 'notch-test-confirm-7', actionId: 'confirm' }), true);
  assert.equal(notchTest.handleAction(null), false);
});

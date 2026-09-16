const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

// O diálogo de verdade precisa ser exercitado: o caminho padrão é onde mora a decisão entre tentar
// de novo e encerrar, e injetar `showWarning` em todo teste deixaria essa decisão sem cobertura.
const dialogStub = {
  answer: 0,
  calls: [],
  showMessageBox: (window, options) => { dialogStub.calls.push({ window, options }); return Promise.resolve({ response: dialogStub.answer }); },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "electron") {
    return {
      app: { isPackaged: true, whenReady: () => ({ then() {} }), on() {}, getVersion() { return "test"; } },
      BrowserWindow: { getAllWindows() { return []; } },
      ipcMain: { handle() {} },
      Notification: {},
      dialog: dialogStub,
    };
  }
  if (request === "./notifications.mjs") return { createNotificationScheduler() { return { clear() {} }; } };
  return originalLoad.call(this, request, parent, isMain);
};
const { isAllowedNavigation, isValidNotchAction, notchCapabilities, attachNotchLifecycle, attachRendererRecovery, rendererRecoveryPrompt, safeAiStreamEvent, routeNotchAction, isRendererPresentationAllowed } = require("./main.cjs");
Module._load = originalLoad;

// Um código fora da lista faz `safeAiFailure` devolver null, e o evento `failed` inteiro é
// descartado: a pessoa veria o turno falhar sem cartão nenhum. Cada código novo precisa entrar aqui.
test('deixa passar a falha de requisição inválida em vez de descartar o evento', () => {
  const event = safeAiStreamEvent({ type: 'failed', requestId: 'r-1', correlationId: 'c-1', failure: { code: 'invalid_request', retryable: false } });
  assert.equal(event?.failure?.code, 'invalid_request');
  assert.equal(safeAiStreamEvent({ type: 'failed', requestId: 'r-1', correlationId: 'c-1', failure: { code: 'inventado', retryable: false } }), null);
});

test('respostas do teste do notch ficam no processo principal e as demais vão ao renderer', () => {
  const sent = [];
  const notchTest = { handleAction: (action) => action.requestId.startsWith('notch-test-') };
  const send = (...args) => sent.push(args);

  assert.equal(routeNotchAction({ requestId: 'notch-test-confirm-1', actionId: 'confirm' }, { notchTest, send }), 'test');
  assert.deepEqual(sent, []);
  assert.equal(routeNotchAction({ requestId: 'confirm-1', actionId: 'cancel' }, { notchTest, send }), 'renderer');
  assert.deepEqual(sent, [['hibi:companion:action', { requestId: 'confirm-1', actionId: 'cancel' }]]);
  assert.equal(routeNotchAction({ requestId: 'confirm-2', actionId: 'confirm' }, { notchTest: undefined, send }), 'renderer');
  assert.equal(sent.length, 2);
});

test('o renderer não pode abrir apresentações com o prefixo reservado ao teste do notch', () => {
  assert.equal(isRendererPresentationAllowed({ requestId: 'confirm-1', kind: 'confirmation', text: 'Ok?', actions: [] }), true);
  assert.equal(isRendererPresentationAllowed({ requestId: 'notch-test-confirm-1', kind: 'confirmation', text: 'Ok?', actions: [] }), false);
  assert.equal(isRendererPresentationAllowed(null), false);
  assert.equal(isRendererPresentationAllowed({ requestId: 42, kind: 'result', text: null, actions: [] }), false);
});

test("allows only local development and packaged file navigation", () => {
  assert.equal(isAllowedNavigation("http://127.0.0.1:5173/"), true);
  assert.equal(isAllowedNavigation("http://localhost:4173/settings"), true);
  assert.equal(isAllowedNavigation("file:///Applications/Hibi.app/Contents/Resources/dist/index.html"), true);

  assert.equal(isAllowedNavigation("https://example.com/"), false);
  assert.equal(isAllowedNavigation("http://192.168.1.20:5173/"), false);
  assert.equal(isAllowedNavigation("data:text/html,<h1>nope</h1>"), false);
  assert.equal(isAllowedNavigation("not a URL"), false);
});

test('allows only bounded confirmation action payloads', () => {
  assert.equal(isValidNotchAction('confirm-1', 'confirm'), true);
  assert.equal(isValidNotchAction('confirm-1', 'cancel'), true);
  assert.equal(isValidNotchAction('', 'confirm'), false);
  assert.equal(isValidNotchAction('x'.repeat(129), 'confirm'), false);
  assert.equal(isValidNotchAction('confirm-1', 'delete'), false);
});

test('forwards only bounded correlation and ownership ids on safe AI stream events', () => {
  assert.deepEqual(
    safeAiStreamEvent({ type: 'delta', correlationId: 'renderer-correlation', requestId: 'main-request', delta: 'safe', apiKey: 'secret-value' }),
    { type: 'delta', correlationId: 'renderer-correlation', requestId: 'main-request', delta: 'safe' },
  );
  assert.equal(safeAiStreamEvent({ type: 'started', requestId: 'main-request' }), null);
  assert.equal(safeAiStreamEvent({ type: 'started', correlationId: 'invalid correlation', requestId: 'main-request' }), null);
  assert.equal(safeAiStreamEvent({ type: 'started', correlationId: 'x'.repeat(129), requestId: 'main-request' }), null);
});

test('reports the active native host through the narrow capabilities payload', () => {
  const result = notchCapabilities({
    id: 'public', experimental: false, reason: null,
    available: () => true, promotionAvailable: () => true,
    nativeHostAvailable: () => true, screenGeometry: () => [{ displayId: 7 }],
  }, { diagnostics: { available: true, visible: true, displayId: 7, host: 'native' } });

  assert.deepEqual(result, {
    adapter: 'public', experimental: false, reason: null, bridgeLoaded: true,
    nativePromotion: true, nativeHost: true, screens: [{ displayId: 7 }],
    host: { available: true, visible: true, displayId: 7, host: 'native' },
  });
});

test('repositions the companion after display changes and wake then unregisters listeners', () => {
  const registered = [];
  const removed = [];
  const eventSource = { on: (event, listener) => registered.push([event, listener]), removeListener: (event, listener) => removed.push([event, listener]) };
  let calls = 0;
  const detach = attachNotchLifecycle({ displayService: eventSource, powerService: eventSource, manager: { reposition: () => { calls += 1; } } });

  assert.deepEqual(registered.map(([event]) => event), ['display-added', 'display-removed', 'display-metrics-changed', 'resume']);
  for (const [, listener] of registered) listener();
  assert.equal(calls, 4);
  detach();
  assert.deepEqual(removed.map(([event]) => event), ['display-added', 'display-removed', 'display-metrics-changed', 'resume']);
  assert.deepEqual(removed, registered);
});

test('avisa a janela principal quando um monitor entra, sai ou muda, depois de reposicionar, e não ao acordar', () => {
  const registered = [];
  const eventSource = { on: (event, listener) => registered.push([event, listener]), removeListener: () => {} };
  const order = [];
  attachNotchLifecycle({ displayService: eventSource, powerService: eventSource, manager: { reposition: () => order.push('reposition') }, onDisplaysChanged: () => order.push('changed') });

  for (const [event, listener] of registered) { order.push(event); listener(); }

  assert.deepEqual(order, ['display-added', 'reposition', 'changed', 'display-removed', 'reposition', 'changed', 'display-metrics-changed', 'reposition', 'changed', 'resume', 'reposition']);
});

test('loga a falha ao reposicionar em vez de lançar, e ainda avisa a janela principal', () => {
  const registered = [];
  const eventSource = { on: (event, listener) => registered.push([event, listener]), removeListener: () => {} };
  let changed = 0;
  const logs = [];
  const log = (message, error) => logs.push([message, error]);
  attachNotchLifecycle({ displayService: eventSource, powerService: eventSource, manager: { reposition: () => { throw new Error('reposition failed'); } }, onDisplaysChanged: () => { changed += 1; }, log });

  const displayAdded = registered.find(([event]) => event === 'display-added')[1];
  assert.doesNotThrow(() => displayAdded());

  assert.equal(changed, 1);
  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], '[notch] reposition failed');
  assert.ok(logs[0][1] instanceof Error);
});

test('loga a falha ao reposicionar no resume sem lançar', () => {
  const registered = [];
  const eventSource = { on: (event, listener) => registered.push([event, listener]), removeListener: () => {} };
  const logs = [];
  const log = (message, error) => logs.push([message, error]);
  attachNotchLifecycle({ displayService: eventSource, powerService: eventSource, manager: { reposition: () => { throw new Error('resume reposition failed'); } }, log });

  const resume = registered.find(([event]) => event === 'resume')[1];
  assert.doesNotThrow(() => resume());

  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], '[notch] reposition failed');
  assert.ok(logs[0][1] instanceof Error);
});

test('recovers a crashed renderer once and resets the guard after a successful load', () => {
  const listeners = new Map();
  let reloads = 0;
  const target = { isDestroyed: () => false, webContents: { on: (event, listener) => listeners.set(event, listener), reloadIgnoringCache: () => { reloads += 1; } } };
  attachRendererRecovery(target);

  listeners.get('render-process-gone')({}, { reason: 'crashed' });
  listeners.get('render-process-gone')({}, { reason: 'crashed' });
  assert.equal(reloads, 1);
  listeners.get('did-finish-load')();
  listeners.get('render-process-gone')({}, { reason: 'crashed' });
  assert.equal(reloads, 2);
});

test('warns once instead of looping when the renderer crashes again before loading', () => {
  const listeners = new Map();
  let reloads = 0;
  const warnings = [];
  const target = { isDestroyed: () => false, webContents: { on: (event, listener) => listeners.set(event, listener), reloadIgnoringCache: () => { reloads += 1; } } };
  attachRendererRecovery(target, { showWarning: (details) => warnings.push(details) });

  listeners.get('render-process-gone')({}, { reason: 'crashed' });
  listeners.get('render-process-gone')({}, { reason: 'crashed' });
  listeners.get('render-process-gone')({}, { reason: 'crashed' });

  assert.equal(reloads, 1);
  assert.equal(warnings.length, 1);
  assert.deepEqual(warnings[0], { reason: 'crashed' });
});

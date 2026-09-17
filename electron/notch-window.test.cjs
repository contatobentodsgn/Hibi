const test = require('node:test'); const assert = require('node:assert/strict'); const { createNotchWindowManager } = require('./notch-window.cjs');
class FakeWindow { constructor(options) { this.options = options; this.destroyed = false; this.calls = []; this.webContents = { send: (...args) => this.calls.push(['send', ...args]) }; } isDestroyed() { return this.destroyed; } setBounds(value) { this.calls.push(['bounds', value]); } setAlwaysOnTop(...args) { this.calls.push(['top', ...args]); } setVisibleOnAllWorkspaces(...args) { this.calls.push(['spaces', ...args]); } setIgnoreMouseEvents(...args) { this.calls.push(['mouse', ...args]); } setFocusable(value) { this.calls.push(['focusable', value]); } focus() { this.calls.push(['focus']); } showInactive() { this.calls.push(['show']); } hide() { this.calls.push(['hide']); } on() {} destroy() { this.destroyed = true; } }
class LoadingWindow extends FakeWindow { constructor(options) { super(options); this.webContents.once = (event, listener) => { if (event === 'did-finish-load') this.finishLoad = listener; }; } }
const display = { id: 1, bounds: { x: 0, y: 0, width: 1440, height: 900 } }; const screen = { getAllDisplays: () => [display], getPrimaryDisplay: () => display };
const presentation = { requestId: 'a', kind: 'result', text: 'Done', actions: [], interaction: 'passthrough' };
test('sets all-spaces fallback and click-through for passive presentations', () => { let loaded = false; const manager = createNotchWindowManager({ BrowserWindowClass: FakeWindow, screen, preloadPath: 'preload', load: () => { loaded = true; }, platform: 'darwin' }); const response = manager.show(presentation); assert.equal(loaded, true); assert.equal(response.degraded, true); assert.equal(manager.activeRequestId, 'a'); });
test('uses a non-activating macOS panel for the companion surface', () => {
  let notch;
  const manager = createNotchWindowManager({ BrowserWindowClass: FakeWindow, screen, preloadPath: 'preload', load: (target) => { notch = target; }, platform: 'darwin' });

  manager.show(presentation);

  assert.equal(notch.options.type, 'panel');
});
test('uses the AppKit host before creating an Electron fallback window', () => {
  const calls = [];
  const nativeBridge = {
    nativeHostAvailable: () => true,
    createHost: (onAction) => { calls.push(['create']); nativeBridge.action = onAction; return true; },
    showHost: (value, displayId) => { calls.push(['show', value.requestId, displayId]); return true; },
    hideHost: () => { calls.push(['hide']); return true; },
    repositionHost: (displayId) => { calls.push(['reposition', displayId]); return true; },
    destroyHost: () => { calls.push(['destroy']); return true; },
    hostDiagnostics: () => ({ available: true, visible: true }),
  };
  const manager = createNotchWindowManager({ BrowserWindowClass: class { constructor() { throw new Error('fallback should not be created'); } }, screen, preloadPath: 'preload', load: () => {}, nativeBridge, platform: 'darwin' });

  const response = manager.show({ requestId: 'native-passive', kind: 'result', text: 'Concluído', actions: [], interaction: 'passthrough' });

  assert.deepEqual(response, { degraded: false, requestId: 'native-passive', host: 'native' });
  assert.deepEqual(calls, [['create'], ['show', 'native-passive', 1]]);
  assert.equal(manager.hide('native-passive'), true);
  assert.equal(manager.activeRequestId, null);
  assert.deepEqual(calls.at(-1), ['hide']);
  manager.destroy();
  assert.deepEqual(calls.at(-1), ['destroy']);
});
test('atualiza o tamanho do host nativo sem reabrir a apresentação', () => {
  const calls = [];
  const nativeBridge = { nativeHostAvailable: () => true, createHost: () => true, showHost: (value) => { calls.push(value.size); return true; }, repositionHost: (...args) => { calls.push(args); return true; } };
  const manager = createNotchWindowManager({ BrowserWindowClass: FakeWindow, screen, preloadPath: 'preload', load: () => {}, nativeBridge, platform: 'darwin' });
  manager.show(presentation);
  assert.equal(manager.setSize('compact'), true);
  assert.deepEqual(calls, ['normal', 'compact']);
});
test('keeps the startup companion on the native visual surface', () => {
  const nativeBridge = { nativeHostAvailable: () => true, createHost: () => true, showHost: () => true };
  const manager = createNotchWindowManager({ BrowserWindowClass: FakeWindow, screen, preloadPath: 'preload', load: () => {}, nativeBridge, platform: 'darwin' });
  const result = manager.show({ requestId: 'startup-notch', kind: 'result', text: null, actions: [], interaction: 'passthrough', host: 'native' });
  assert.equal(result.host, 'native');
});

test('reenvia a apresentação quando a overlay termina de carregar', () => {
  let notch;
  const manager = createNotchWindowManager({ BrowserWindowClass: LoadingWindow, screen, preloadPath: 'preload', load: (target) => { notch = target; }, platform: 'darwin' });
  manager.show({ requestId: 'load-race', kind: 'idle', text: null, actions: [], interaction: 'passthrough', host: 'electron' });
  const sendsBeforeLoad = notch.calls.filter(([name]) => name === 'send').length;
  notch.finishLoad();
  assert.equal(notch.calls.filter(([name]) => name === 'send').length, sendsBeforeLoad + 1);
});

test('keeps action-bearing presentations out of the native visual host', () => {
  const calls = [];
  const nativeBridge = {
    nativeHostAvailable: () => true,
    createHost: () => { calls.push('create'); return true; },
    showHost: () => { calls.push('native-show'); return true; },
  };
  let notch;
  const manager = createNotchWindowManager({ BrowserWindowClass: FakeWindow, screen, preloadPath: 'preload', load: (target) => { notch = target; }, nativeBridge, platform: 'darwin' });
  const response = manager.show({ requestId: 'action-surface', kind: 'confirmation', text: 'Confirmar?', actions: [{ id: 'confirm', label: 'Confirmar' }], interaction: 'capture' });

  assert.deepEqual(response, { degraded: true, requestId: 'action-surface', host: 'electron' });
  assert.deepEqual(calls, []);
  const visual = require('./notch-geometry.cjs').notchBounds(display);
  assert.ok(notch.calls.some((call) => call[0] === 'bounds' && call[1].y > visual.y + visual.height));
});

test('prefers the physical Mac notch display when an external display is primary', () => {
  const calls = [];
  const external = { id: 2, bounds: { x: 0, y: 0, width: 2560, height: 1080 } };
  const macbook = { id: 1, bounds: { x: 570, y: -956, width: 1470, height: 956 } };
  const multiScreen = { getAllDisplays: () => [external, macbook], getPrimaryDisplay: () => external };
  const nativeBridge = {
    nativeHostAvailable: () => true,
    createHost: () => true,
    screenGeometry: () => [{ displayId: 2, hasCameraHousing: false }, { displayId: 1, hasCameraHousing: true }],
    showHost: (_presentation, displayId) => { calls.push(displayId); return true; },
  };
  const manager = createNotchWindowManager({ BrowserWindowClass: FakeWindow, screen: multiScreen, preloadPath: 'preload', load: () => {}, nativeBridge, platform: 'darwin' });

  manager.show({ requestId: 'native-mac', kind: 'result', text: 'Check', actions: [], interaction: 'passthrough' });

  assert.deepEqual(calls, [1]);
});

// Antes o companion inicial ficava preso à tela com câmera mesmo com monitor escolhido. Como ele é
// o mascote que fica na tela o tempo todo, a escolha de monitor não movia nada e parecia quebrada.
test('o companion inicial abre no monitor escolhido, e na tela com câmera quando não há escolha', () => {
  const external = { id: 2, bounds: { x: 0, y: 0, width: 2560, height: 1080 } };
  const macbook = { id: 1, bounds: { x: 570, y: -956, width: 1470, height: 956 } };
  const multiScreen = { getAllDisplays: () => [external, macbook], getPrimaryDisplay: () => external };
  const nativeBridge = { screenGeometry: () => [{ displayId: 2, hasCameraHousing: false }, { displayId: 1, hasCameraHousing: true }] };
  const abrir = (preferredDisplayId) => {
    let notch;
    const manager = createNotchWindowManager({ BrowserWindowClass: FakeWindow, screen: multiScreen, preloadPath: 'preload', load: (target) => { notch = target; }, nativeBridge, platform: 'darwin', preferredDisplayId });
    manager.show({ requestId: 'startup-notch', kind: 'idle', text: null, actions: [], interaction: 'passthrough', host: 'electron' });
    return notch;
  };
  const { notchBounds } = require('./notch-geometry.cjs');

  const escolhido = abrir(2);
  assert.equal(escolhido.options.x, notchBounds(external).x);
  assert.equal(escolhido.options.y, external.bounds.y);

  const semEscolha = abrir(null);
  assert.equal(semEscolha.options.x, notchBounds(macbook).x);
  assert.equal(semEscolha.options.y, macbook.bounds.y);
});

test('falls back to Electron when AppKit host creation fails', () => {
  let notch;
  const manager = createNotchWindowManager({ BrowserWindowClass: FakeWindow, screen, preloadPath: 'preload', load: (target) => { notch = target; }, nativeBridge: { nativeHostAvailable: () => true, createHost: () => false }, platform: 'darwin' });

  const response = manager.show(presentation);

  assert.equal(response.degraded, true);
  assert.equal(response.host, 'electron');
  assert.equal(notch.options.type, 'panel');
});

test('falls back to Electron when the native host throws while presenting', () => {
  let notch;
  const manager = createNotchWindowManager({ BrowserWindowClass: FakeWindow, screen, preloadPath: 'preload', load: (target) => { notch = target; }, nativeBridge: { nativeHostAvailable: () => true, createHost: () => true, showHost: () => { throw new Error('native host unavailable'); } }, platform: 'darwin' });

  const response = manager.show(presentation);

  assert.deepEqual(response, { degraded: true, requestId: 'a', host: 'electron' });
  assert.equal(notch.options.type, 'panel');
});
test('guards delayed hide requests and tears down safely', () => { const manager = createNotchWindowManager({ BrowserWindowClass: FakeWindow, screen, preloadPath: 'preload', load: () => {} }); manager.show(presentation); assert.equal(manager.hide('old'), false); assert.equal(manager.hide('a'), true); manager.destroy(); });
test('resolves only an action belonging to the active presentation', () => {
  const received = [];
  const manager = createNotchWindowManager({ BrowserWindowClass: FakeWindow, screen, preloadPath: 'preload', load: () => {}, onAction: (action) => received.push(action) });
  manager.show({ requestId: 'confirm-1', kind: 'confirmation', text: 'Create task?', actions: [{ id: 'confirm', label: 'Confirmar' }, { id: 'cancel', label: 'Cancelar' }], interaction: 'capture' });
  assert.equal(manager.resolveAction('other', 'confirm'), false);
  assert.equal(manager.resolveAction('confirm-1', 'unknown'), false);
  assert.equal(manager.resolveAction('confirm-1', 'confirm'), true);
  assert.deepEqual(received, [{ requestId: 'confirm-1', actionId: 'confirm' }]);
  assert.equal(manager.activeRequestId, null);
});
test('cancelling a confirmation releases mouse capture before closing the card', () => {
  let notch;
  let manager;
  const callbackStates = [];
  manager = createNotchWindowManager({ BrowserWindowClass: FakeWindow, screen, preloadPath: 'preload', load: (target) => { notch = target; }, onAction: () => callbackStates.push(manager.activeRequestId) });
  manager.show({ requestId: 'confirm-cancel', kind: 'confirmation', text: 'Create task?', actions: [{ id: 'confirm', label: 'Confirmar' }, { id: 'cancel', label: 'Cancelar' }], interaction: 'capture' });

  assert.equal(manager.resolveAction('confirm-cancel', 'cancel'), true);

  assert.deepEqual(notch.calls.at(-3), ['mouse', true, { forward: true }]);
  assert.deepEqual(notch.calls.at(-2), ['focusable', false]);
  assert.deepEqual(notch.calls.at(-1), ['hide']);
  assert.equal(manager.activeRequestId, null);
  assert.deepEqual(callbackStates, [null]);
});
test('makes a confirmation keyboard reachable, then restores passive behavior', () => {
  let notch;
  const manager = createNotchWindowManager({ BrowserWindowClass: FakeWindow, screen, preloadPath: 'preload', load: (target) => { notch = target; } });
  manager.show({ requestId: 'keyboard-confirm', kind: 'confirmation', text: 'Create task?', actions: [{ id: 'confirm', label: 'Confirmar' }], interaction: 'capture' });
  assert.ok(notch.calls.some((call) => call[0] === 'focusable' && call[1] === true));
  assert.ok(notch.calls.some((call) => call[0] === 'focus'));
  manager.resolveAction('keyboard-confirm', 'confirm');
  assert.ok(notch.calls.some((call) => call[0] === 'focusable' && call[1] === false));
});

// Regressão: o addon exige (handle, x, y, width, height). Com o objeto `bounds`, `show()` lançava
// antes de enviar a apresentação, e toda confirmação do notch sumia em silêncio no app real.
const nativePlace = (placed) => (handle, x, y, width, height) => {
  if (!Buffer.isBuffer(handle) || ![x, y, width, height].every(Number.isFinite)) throw new TypeError('Expected native handle and x, y, width, height.');
  placed.push([x, y, width, height]); return true;
};
class HandleWindow extends FakeWindow { getNativeWindowHandle() { return Buffer.alloc(8); } }
const confirmation = { requestId: 'confirm-1', kind: 'confirmation', text: 'Aplicar?', actions: [{ id: 'confirm', label: 'Confirmar' }, { id: 'cancel', label: 'Cancelar' }], interaction: 'capture' };

test('uma confirmação passa ao addon o handle e os quatro números da posição', () => {
  const placed = []; let notch;
  const manager = createNotchWindowManager({ BrowserWindowClass: HandleWindow, screen, preloadPath: 'preload', load: (target) => { notch = target; }, nativeBridge: { place: nativePlace(placed) }, platform: 'darwin' });

  assert.equal(manager.show(confirmation).host, 'electron');

  const bounds = notch.calls.filter(([name]) => name === 'bounds').at(-1)[1];
  assert.deepEqual(placed.at(-1), [bounds.x, bounds.y, bounds.width, bounds.height]);
  assert.ok(notch.calls.some(([name, channel]) => name === 'send' && channel === 'hibi:companion:presentation'));
  assert.ok(notch.calls.some(([name]) => name === 'show'));
});

test('uma falha na colocação nativa não impede a confirmação de aparecer', () => {
  let notch;
  const manager = createNotchWindowManager({ BrowserWindowClass: HandleWindow, screen, preloadPath: 'preload', load: (target) => { notch = target; }, nativeBridge: { place: () => { throw new Error('native placement failed'); } }, platform: 'darwin' });

  manager.show(confirmation);

  assert.ok(notch.calls.some(([name, channel]) => name === 'send' && channel === 'hibi:companion:presentation'));
  assert.ok(notch.calls.some(([name]) => name === 'show'));
});

// Regressão: a primeira confirmação é enviada enquanto a overlay recém-criada ainda carrega e se
// perde, deixando um painel vazio sobre o notch. A overlay busca esta apresentação ao montar.
test('a overlay consegue buscar a confirmação ativa que chegou antes de ela montar', () => {
  const manager = createNotchWindowManager({ BrowserWindowClass: HandleWindow, screen, preloadPath: 'preload', load: () => {}, nativeBridge: { place: nativePlace([]) }, platform: 'darwin' });
  assert.equal(manager.activePresentation, null);

  manager.show(confirmation);
  assert.deepEqual(manager.activePresentation, confirmation);
  manager.resolveAction('confirm-1', 'confirm');
  assert.equal(manager.activePresentation, null);

  manager.show(confirmation);
  manager.hide('confirm-1');
  assert.equal(manager.activePresentation, null);
});

test('o automático é reavaliado a cada apresentação: a tampa aberta depois de iniciar passa a valer', () => {
  const calls = [];
  const external = { id: 2, bounds: { x: 0, y: 0, width: 2560, height: 1080 } };
  const macbook = { id: 1, bounds: { x: 570, y: -956, width: 1470, height: 956 } };
  let lidOpen = false;
  const multiScreen = { getAllDisplays: () => lidOpen ? [external, macbook] : [external], getPrimaryDisplay: () => external };
  const nativeBridge = {
    nativeHostAvailable: () => true,
    createHost: () => true,
    screenGeometry: () => lidOpen ? [{ displayId: 2, hasCameraHousing: false }, { displayId: 1, hasCameraHousing: true }] : [{ displayId: 2, hasCameraHousing: false }],
    showHost: (_presentation, displayId) => { calls.push(displayId); return true; },
  };
  const manager = createNotchWindowManager({ BrowserWindowClass: FakeWindow, screen: multiScreen, preloadPath: 'preload', load: () => {}, nativeBridge, platform: 'darwin' });

  manager.show({ requestId: 'lid-closed', kind: 'result', text: 'a', actions: [], interaction: 'passthrough' });
  lidOpen = true;
  manager.show({ requestId: 'lid-open', kind: 'result', text: 'b', actions: [], interaction: 'passthrough' });

  assert.deepEqual(calls, [2, 1]);
});

test('usa a preferência inicial e volta ao automático com setPreferredDisplay(null)', () => {
  const calls = [];
  const external = { id: 2, bounds: { x: 0, y: 0, width: 2560, height: 1080 } };
  const macbook = { id: 1, bounds: { x: 570, y: -956, width: 1470, height: 956 } };
  const multiScreen = { getAllDisplays: () => [external, macbook], getPrimaryDisplay: () => external };
  const nativeBridge = {
    nativeHostAvailable: () => true,
    createHost: () => true,
    screenGeometry: () => [{ displayId: 2, hasCameraHousing: false }, { displayId: 1, hasCameraHousing: true }],
    showHost: (_presentation, displayId) => { calls.push(displayId); return true; },
    repositionHost: (displayId) => { calls.push(['reposition', displayId]); return true; },
  };
  const manager = createNotchWindowManager({ BrowserWindowClass: FakeWindow, screen: multiScreen, preloadPath: 'preload', load: () => {}, nativeBridge, platform: 'darwin', preferredDisplayId: 2 });

  manager.show({ requestId: 'preferred', kind: 'result', text: 'a', actions: [], interaction: 'passthrough' });
  manager.setPreferredDisplay(null);
  manager.show({ requestId: 'automatic', kind: 'result', text: 'b', actions: [], interaction: 'passthrough' });

  assert.deepEqual(calls, [2, ['reposition', 1], 1]);
});

test('uma confirmação é posicionada no monitor resolvido, não na tela principal', () => {
  const external = { id: 2, bounds: { x: 0, y: 0, width: 2560, height: 1080 } };
  const macbook = { id: 1, bounds: { x: 570, y: -956, width: 1470, height: 956 } };
  const multiScreen = { getAllDisplays: () => [external, macbook], getPrimaryDisplay: () => external };
  const placed = [];
  const nativeBridge = { screenGeometry: () => [{ displayId: 1, hasCameraHousing: true }], place: (_handle, x, y, width, height) => placed.push({ x, y, width, height }) };
  let notch;
  const manager = createNotchWindowManager({ BrowserWindowClass: class extends FakeWindow { getNativeWindowHandle() { return Buffer.alloc(8); } }, screen: multiScreen, preloadPath: 'preload', load: (target) => { notch = target; }, nativeBridge, platform: 'darwin' });

  manager.show({ requestId: 'confirm-on-mac', kind: 'confirmation', text: 'Ok?', actions: [{ id: 'confirm', label: 'Confirmar' }], interaction: 'capture' });

  const bounds = notch.calls.filter((call) => call[0] === 'bounds').at(-1)[1];
  assert.ok(bounds.x >= macbook.bounds.x && bounds.x + bounds.width <= macbook.bounds.x + macbook.bounds.width);
  assert.ok(bounds.y >= macbook.bounds.y && bounds.y < macbook.bounds.y + macbook.bounds.height);
  assert.deepEqual(placed.at(-1), { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
});

test('uma falha ao ler as telas do addon cai para a tela principal', () => {
  const calls = [];
  const nativeBridge = {
    nativeHostAvailable: () => true,
    createHost: () => true,
    screenGeometry: () => { throw new Error('addon indisponível'); },
    showHost: (_presentation, displayId) => { calls.push(displayId); return true; },
  };
  const manager = createNotchWindowManager({ BrowserWindowClass: FakeWindow, screen, preloadPath: 'preload', load: () => {}, nativeBridge, platform: 'darwin' });

  manager.show(presentation);

  assert.deepEqual(calls, [1]);
});

test('describeDisplays informa rótulo, principal, câmera e o monitor resolvido', () => {
  const external = { id: 2, label: 'LG ULTRAWIDE', internal: false, bounds: { x: 0, y: 0, width: 2560, height: 1080 } };
  const macbook = { id: 1, label: '', internal: true, bounds: { x: 570, y: -956, width: 1470, height: 956 } };
  const multiScreen = { getAllDisplays: () => [external, macbook], getPrimaryDisplay: () => external };
  const nativeBridge = { screenGeometry: () => [{ displayId: 1, hasCameraHousing: true }] };
  const manager = createNotchWindowManager({ BrowserWindowClass: FakeWindow, screen: multiScreen, preloadPath: 'preload', load: () => {}, nativeBridge, platform: 'darwin' });

  assert.deepEqual(manager.describeDisplays(), {
    resolvedDisplayId: 1,
    reason: 'camera-housing',
    displays: [
      { id: 2, label: 'LG ULTRAWIDE', primary: true, internal: false, hasCameraHousing: false, width: 2560, height: 1080 },
      { id: 1, label: 'Monitor 2', primary: false, internal: true, hasCameraHousing: true, width: 1470, height: 956 },
    ],
  });
  manager.setPreferredDisplay(2);
  assert.deepEqual({ ...manager.describeDisplays(), displays: undefined }, { resolvedDisplayId: 2, reason: 'preferred', displays: undefined });
});

test('uma falha ao criar a janela não deixa uma confirmação fantasma ativa', () => {
  const manager = createNotchWindowManager({ BrowserWindowClass: class { constructor() { throw new Error('sem janela'); } }, screen, preloadPath: 'preload', load: () => {}, platform: 'darwin' });

  assert.throws(() => manager.show({ requestId: 'ghost', kind: 'confirmation', text: 'Ok?', actions: [{ id: 'confirm', label: 'Confirmar' }], interaction: 'capture' }), /sem janela/);

  assert.equal(manager.activeInteractive, false);
  assert.equal(manager.activeRequestId, null);
  assert.equal(manager.activePresentation, null);
});

// Registra, numa só lista, a ordem entre a janela Electron e o host nativo.
const orderedHosts = () => {
  const order = [];
  class OrderedWindow extends FakeWindow { showInactive() { order.push('electron-show'); super.showInactive(); } hide() { order.push('electron-hide'); super.hide(); } }
  const nativeBridge = { nativeHostAvailable: () => true, createHost: () => true, showHost: (value) => { order.push(['native-show', value.requestId]); return true; }, hideHost: () => { order.push('native-hide'); return true; } };
  return { order, OrderedWindow, nativeBridge };
};

test('um cartão passivo no host nativo esconde a confirmação que estava na janela Electron', () => {
  const { order, OrderedWindow, nativeBridge } = orderedHosts();
  let notch;
  const manager = createNotchWindowManager({ BrowserWindowClass: OrderedWindow, screen, preloadPath: 'preload', load: (target) => { notch = target; }, nativeBridge, platform: 'darwin' });

  manager.show(confirmation);
  assert.equal(manager.activeHost, 'electron');
  const shownAt = notch.calls.findLastIndex(([name]) => name === 'show');
  manager.show(presentation);

  const after = notch.calls.slice(shownAt + 1);
  const passiveAt = after.findIndex((call) => call[0] === 'mouse' && call[1] === true);
  assert.deepEqual(after[passiveAt], ['mouse', true, { forward: true }]);
  assert.ok(after.findIndex((call) => call[0] === 'focusable' && call[1] === false) > passiveAt);
  assert.ok(after.findIndex(([name]) => name === 'hide') > passiveAt);
  assert.deepEqual(order, ['electron-show', 'electron-hide', ['native-show', 'a']]);
  assert.equal(manager.activeHost, 'native');
  assert.equal(manager.activeInteractive, false);
});

test('uma confirmação na janela Electron esconde antes a pílula do host nativo', () => {
  const { order, OrderedWindow, nativeBridge } = orderedHosts();
  const manager = createNotchWindowManager({ BrowserWindowClass: OrderedWindow, screen, preloadPath: 'preload', load: () => {}, nativeBridge, platform: 'darwin' });

  manager.show(presentation);
  assert.equal(manager.activeHost, 'native');
  manager.show(confirmation);

  assert.deepEqual(order, [['native-show', 'a'], 'native-hide', 'electron-show']);
  assert.equal(manager.activeHost, 'electron');
});

test('apresentações seguidas no mesmo host não escondem a superfície entre elas', () => {
  const native = orderedHosts();
  const nativeManager = createNotchWindowManager({ BrowserWindowClass: native.OrderedWindow, screen, preloadPath: 'preload', load: () => {}, nativeBridge: native.nativeBridge, platform: 'darwin' });
  nativeManager.show(presentation);
  nativeManager.show({ ...presentation, requestId: 'b' });
  assert.deepEqual(native.order, [['native-show', 'a'], ['native-show', 'b']]);

  let notch;
  const electronManager = createNotchWindowManager({ BrowserWindowClass: FakeWindow, screen, preloadPath: 'preload', load: (target) => { notch = target; }, platform: 'darwin' });
  electronManager.show(confirmation);
  electronManager.show(presentation);
  assert.equal(electronManager.activeHost, 'electron');
  assert.equal(notch.calls.filter(([name]) => name === 'hide').length, 0);
  assert.equal(notch.calls.filter(([name]) => name === 'show').length, 2);
});

// Regressão: se o host nativo falhar ao mostrar depois de trocar de host, o fallback precisa
// reexibir a janela Electron (que a troca já tinha escondido) sem tocar no host nativo.
test('quando o host nativo falha ao mostrar depois de trocar de host, o fallback reexibe a janela Electron sem esconder o host nativo', () => {
  const order = [];
  class OrderedWindow extends FakeWindow { showInactive() { order.push('electron-show'); super.showInactive(); } hide() { order.push('electron-hide'); super.hide(); } }
  const hideHostCalls = [];
  const nativeBridge = { nativeHostAvailable: () => true, createHost: () => true, showHost: () => false, hideHost: () => { hideHostCalls.push(1); return true; } };
  const manager = createNotchWindowManager({ BrowserWindowClass: OrderedWindow, screen, preloadPath: 'preload', load: () => {}, nativeBridge, platform: 'darwin' });

  manager.show(confirmation);
  assert.equal(manager.activeHost, 'electron');
  order.length = 0;

  const response = manager.show(presentation);

  assert.deepEqual(order, ['electron-hide', 'electron-show']);
  assert.equal(manager.activeHost, 'electron');
  assert.equal(response.host, 'electron');
  assert.deepEqual(hideHostCalls, []);
});

test('activeInteractive só é verdadeiro enquanto há uma confirmação ativa', () => {
  const manager = createNotchWindowManager({ BrowserWindowClass: FakeWindow, screen, preloadPath: 'preload', load: () => {}, platform: 'darwin' });

  assert.equal(manager.activeInteractive, false);
  manager.show(presentation);
  assert.equal(manager.activeInteractive, false);
  manager.show({ requestId: 'confirm-me', kind: 'confirmation', text: 'Ok?', actions: [{ id: 'confirm', label: 'Confirmar' }], interaction: 'capture' });
  assert.equal(manager.activeInteractive, true);
  manager.resolveAction('confirm-me', 'confirm');
  assert.equal(manager.activeInteractive, false);
});

// O companion ocioso é o mascote: quando nenhum cartão está no ar, a superfície volta a ele em vez de
// ficar vazia. Antes, o notch sumia depois do primeiro cartão e só voltava reabrindo o app.
const idle = { requestId: 'startup-notch', kind: 'idle', text: null, actions: [], interaction: 'passthrough', host: 'native', animationPath: '/loop.mp4' };
const baseOptions = () => ({ BrowserWindowClass: FakeWindow, screen, preloadPath: 'preload', load: () => {}, platform: 'darwin' });
const pontePreenchida = (registro) => ({
  nativeHostAvailable: () => true,
  createHost: () => true,
  showHost: (presentation) => { registro.push(presentation.requestId); return true; },
  hideHost: () => { registro.push('escondido'); return true; },
  repositionHost: () => true,
  destroyHost: () => true,
  hostDiagnostics: () => ({ available: true, visible: true }),
});

test('esconder um cartão devolve o companion ocioso ao notch', () => {
  const host = [];
  const manager = createNotchWindowManager({
    ...baseOptions(),
    nativeBridge: pontePreenchida(host),
    idlePresentation: () => idle,
  });

  manager.show(idle);
  manager.show({ requestId: 'c-1', kind: 'confirmation', text: 'Ok?', actions: [{ id: 'confirm', label: 'Ok' }], interaction: 'capture' });
  assert.equal(manager.hide('c-1'), true);

  // Depois de esconder o cartão, o último a subir é o ocioso outra vez.
  assert.equal(host.at(-1), 'startup-notch');
});

test('responder uma confirmação também devolve o companion ocioso', () => {
  const host = [];
  const manager = createNotchWindowManager({
    ...baseOptions(),
    nativeBridge: pontePreenchida(host),
    idlePresentation: () => idle,
  });

  manager.show({ requestId: 'c-2', kind: 'confirmation', text: 'Ok?', actions: [{ id: 'confirm', label: 'Ok' }], interaction: 'capture' });
  assert.equal(manager.resolveAction('c-2', 'confirm'), true);

  assert.equal(host.at(-1), 'startup-notch');
});

test('esconder o próprio ocioso não o traz de volta, senão nada o apagaria', () => {
  const host = [];
  const manager = createNotchWindowManager({
    ...baseOptions(),
    nativeBridge: pontePreenchida(host),
    idlePresentation: () => idle,
  });

  manager.show(idle);
  assert.equal(manager.hide('startup-notch'), true);

  assert.deepEqual(host, ['startup-notch', 'escondido']);
});

test('sem companion ocioso configurado, esconder continua escondendo', () => {
  const host = [];
  const manager = createNotchWindowManager({
    ...baseOptions(),
    nativeBridge: pontePreenchida(host),
  });

  manager.show({ requestId: 'c-3', kind: 'result', text: 'Pronto', actions: [], interaction: 'passthrough' });
  assert.equal(manager.hide('c-3'), true);

  assert.deepEqual(host, ['c-3', 'escondido']);
});

// A troca de monitor parecia não funcionar: o mascote ocupa a tela o tempo todo e ignorava a
// escolha, então o ajuste era salvo e nada se movia.
test('o mascote vai para o monitor escolhido, e não fica preso à tela com câmera', () => {
  const external = { id: 2, label: 'LG ULTRAWIDE', internal: false, bounds: { x: 0, y: 0, width: 2560, height: 1080 } };
  const macbook = { id: 1, label: 'Built-in', internal: true, bounds: { x: 570, y: -956, width: 1470, height: 956 } };
  const multiScreen = { getAllDisplays: () => [external, macbook], getPrimaryDisplay: () => external };
  const posicionamentos = [];
  const nativeBridge = {
    nativeHostAvailable: () => true, createHost: () => true,
    screenGeometry: () => [{ displayId: 1, hasCameraHousing: true }],
    showHost: (_presentation, displayId) => { posicionamentos.push(displayId); return true; },
    repositionHost: (displayId) => { posicionamentos.push(displayId); return true; },
  };
  const manager = createNotchWindowManager({ BrowserWindowClass: FakeWindow, screen: multiScreen, preloadPath: 'preload', load: () => {}, nativeBridge, platform: 'darwin' });
  manager.show({ requestId: 'startup-notch', kind: 'idle', text: null, actions: [], interaction: 'passthrough', host: 'native' });

  manager.setPreferredDisplay(2);

  assert.deepEqual(posicionamentos, [1, 2], 'nasce na tela com câmera e vai para a escolhida');
  assert.equal(manager.describeDisplays().resolvedDisplayId, 2);
  assert.equal(manager.describeDisplays().reason, 'preferred');
});

test('sem escolha feita, o mascote nasce na tela interna com câmera', () => {
  const external = { id: 2, label: 'LG ULTRAWIDE', internal: false, bounds: { x: 0, y: 0, width: 2560, height: 1080 } };
  const macbook = { id: 1, label: 'Built-in', internal: true, bounds: { x: 570, y: -956, width: 1470, height: 956 } };
  const multiScreen = { getAllDisplays: () => [external, macbook], getPrimaryDisplay: () => external };
  const posicionamentos = [];
  const nativeBridge = {
    nativeHostAvailable: () => true, createHost: () => true,
    screenGeometry: () => [{ displayId: 1, hasCameraHousing: true }],
    showHost: (_presentation, displayId) => { posicionamentos.push(displayId); return true; },
  };
  const manager = createNotchWindowManager({ BrowserWindowClass: FakeWindow, screen: multiScreen, preloadPath: 'preload', load: () => {}, nativeBridge, platform: 'darwin' });

  manager.show({ requestId: 'startup-notch', kind: 'idle', text: null, actions: [], interaction: 'passthrough', host: 'native' });

  assert.deepEqual(posicionamentos, [1]);
});

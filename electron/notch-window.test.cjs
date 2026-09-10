const test = require('node:test'); const assert = require('node:assert/strict'); const { createNotchWindowManager } = require('./notch-window.cjs');
class FakeWindow { constructor(options) { this.options = options; this.destroyed = false; this.calls = []; this.webContents = { send: (...args) => this.calls.push(['send', ...args]) }; } isDestroyed() { return this.destroyed; } setBounds(value) { this.calls.push(['bounds', value]); } setAlwaysOnTop(...args) { this.calls.push(['top', ...args]); } setVisibleOnAllWorkspaces(...args) { this.calls.push(['spaces', ...args]); } setIgnoreMouseEvents(...args) { this.calls.push(['mouse', ...args]); } setFocusable(value) { this.calls.push(['focusable', value]); } focus() { this.calls.push(['focus']); } showInactive() { this.calls.push(['show']); } hide() { this.calls.push(['hide']); } on() {} destroy() { this.destroyed = true; } }
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

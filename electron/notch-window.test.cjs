const test = require('node:test'); const assert = require('node:assert/strict'); const { createNotchWindowManager } = require('./notch-window.cjs');
class FakeWindow { constructor(options) { this.options = options; this.destroyed = false; this.calls = []; this.webContents = { send: (...args) => this.calls.push(['send', ...args]) }; } isDestroyed() { return this.destroyed; } setBounds(value) { this.calls.push(['bounds', value]); } setAlwaysOnTop(...args) { this.calls.push(['top', ...args]); } setVisibleOnAllWorkspaces(...args) { this.calls.push(['spaces', ...args]); } setIgnoreMouseEvents(...args) { this.calls.push(['mouse', ...args]); } showInactive() { this.calls.push(['show']); } moveTop() { this.calls.push(['move-top']); } hide() { this.calls.push(['hide']); } on() {} destroy() { this.destroyed = true; } }
const display = { id: 1, bounds: { x: 0, y: 0, width: 1440, height: 900 } }; const screen = { getAllDisplays: () => [display], getPrimaryDisplay: () => display };
const presentation = { requestId: 'a', kind: 'result', text: 'Done', actions: [], interaction: 'passthrough' };
test('sets all-spaces fallback and click-through for passive presentations', () => { let loaded = false; const manager = createNotchWindowManager({ BrowserWindowClass: FakeWindow, screen, preloadPath: 'preload', load: () => { loaded = true; }, platform: 'darwin' }); const response = manager.show(presentation); assert.equal(loaded, true); assert.equal(response.degraded, true); assert.equal(manager.activeRequestId, 'a'); });
test('raises the visible notch card to the top of the z-order without focusing it', () => {
  let notch;
  const manager = createNotchWindowManager({ BrowserWindowClass: FakeWindow, screen, preloadPath: 'preload', load: (target) => { notch = target; }, platform: 'darwin' });

  manager.show(presentation);

  assert.deepEqual(notch.calls.at(-2), ['show']);
  assert.deepEqual(notch.calls.at(-1), ['move-top']);
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

  assert.deepEqual(notch.calls.at(-2), ['mouse', true, { forward: true }]);
  assert.deepEqual(notch.calls.at(-1), ['hide']);
  assert.equal(manager.activeRequestId, null);
  assert.deepEqual(callbackStates, [null]);
});

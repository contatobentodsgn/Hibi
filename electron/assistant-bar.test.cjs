const test = require('node:test');
const assert = require('node:assert/strict');
const { barBounds, barModeFor, cleanInput, createAssistantBar } = require('./assistant-bar.cjs');

const macbook = { id: 1, bounds: { x: 570, y: -956, width: 1470, height: 956 } };
class FakeWindow {
  constructor(options) { this.options = options; this.sent = []; this.bounds = null; this.visible = false; this.focused = false; this.listeners = {}; this.webContents = { send: (...args) => this.sent.push(args), once() {} }; FakeWindow.created.push(this); }
  setBounds(bounds) { this.bounds = bounds; }
  setAlwaysOnTop() {} setVisibleOnAllWorkspaces() {}
  on(event, fn) { this.listeners[event] = fn; }
  show() { this.visible = true; } showInactive() { this.visible = true; } focus() { this.focused = true; } hide() { this.visible = false; }
  isDestroyed() { return false; } destroy() {}
}
FakeWindow.created = [];
const makeBar = (actions = []) => { FakeWindow.created = []; return createAssistantBar({ BrowserWindowClass: FakeWindow, load() {}, displayFor: () => macbook, sizeFor: () => 'compact', onAction: (action) => actions.push(action), platform: 'darwin' }); };

test('cada tipo de apresentação vai para um modo da barra, e o que não tem texto nem botão não vai', () => {
  assert.equal(barModeFor({ kind: 'listening', text: null, actions: [] }), 'listening');
  assert.equal(barModeFor({ kind: 'thinking', text: null, actions: [] }), 'thinking');
  assert.equal(barModeFor({ kind: 'result', text: 'Pronto.', actions: [] }), 'reply');
  assert.equal(barModeFor({ kind: 'result', text: null, actions: [] }), null);
  assert.equal(barModeFor({ kind: 'confirmation', text: 'Criar?', actions: [{ id: 'confirm', label: 'Confirmar' }] }), 'confirmation');
  assert.equal(barModeFor({ kind: 'reminder', text: 'Água', actions: [] }), 'notice');
  assert.equal(barModeFor({ kind: 'idle', text: null, actions: [] }), null);
});

test('a barra nasce embaixo do mascote, centrada no monitor do notch', () => {
  const bounds = barBounds(macbook, 'input', 'compact');
  assert.equal(bounds.y, -956 + 142 + 10);
  assert.equal(bounds.x + bounds.width / 2, 570 + 1470 / 2);
  assert.equal(bounds.width, 390);
  assert.ok(barBounds(macbook, 'reply', 'compact').height > bounds.height);
});

test('abrir para digitar mostra a barra com o teclado; o resto aparece sem roubar o foco', () => {
  const bar = makeBar();
  bar.openInput();
  const [window] = FakeWindow.created;
  assert.equal(window.options.type, 'panel');
  assert.equal(window.focused, true);
  assert.deepEqual(window.sent.at(-1), ['pixano:bar:content', { requestId: 'assistant-bar-input', mode: 'input', kind: 'input', text: null, actions: [] }]);

  window.focused = false;
  bar.show({ requestId: 'r1', kind: 'listening', text: 'crie uma', actions: [] });
  assert.equal(window.focused, false);
  assert.equal(window.sent.at(-1)[1].mode, 'listening');
  assert.equal(FakeWindow.created.length, 1, 'a mesma janela troca de modo, sem abrir outra');
});

test('esconder com um pedido só vale se a barra ainda mostra aquele pedido', () => {
  const bar = makeBar();
  bar.show({ requestId: 'r1', kind: 'result', text: 'Pronto.', actions: [] });
  assert.equal(bar.hide('outro'), false);
  assert.equal(bar.current().requestId, 'r1');
  assert.equal(bar.hide('r1'), true);
  assert.equal(bar.current(), null);
});

test('um botão só responde pelo pedido que a barra mostra e por um botão que ele tem', () => {
  const actions = [];
  const bar = makeBar(actions);
  bar.show({ requestId: 'c1', kind: 'confirmation', text: 'Criar tarefa?', actions: [{ id: 'confirm', label: 'Confirmar' }, { id: 'cancel', label: 'Cancelar' }] });
  assert.equal(bar.resolveAction('c1', 'apagar-tudo'), false);
  assert.equal(bar.resolveAction('outro', 'confirm'), false);
  assert.equal(bar.resolveAction('c1', 'confirm'), true);
  assert.deepEqual(actions, [{ requestId: 'c1', actionId: 'confirm' }]);
});

test('o texto digitado é limpo e limitado; vazio não vira pedido', () => {
  assert.equal(cleanInput('  crie uma tarefa  '), 'crie uma tarefa');
  assert.equal(cleanInput('   '), null);
  assert.equal(cleanInput(42), null);
  assert.equal(cleanInput('a'.repeat(5000)).length, 2000);
});

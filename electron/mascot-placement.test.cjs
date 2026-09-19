const test = require('node:test');
const assert = require('node:assert/strict');
const { createMascotPlacement, mascotSharesDisplay } = require('./mascot-placement.cjs');

const LAPTOP = { id: 1, bounds: { x: 0, y: 0, width: 1512, height: 982 } };
const ULTRAWIDE = { id: 2, bounds: { x: 1512, y: 0, width: 2560, height: 1080 } };
// Como o Electron: a tela que contém a maior parte do retângulo.
const fakeScreen = () => {
  const listeners = new Map();
  return {
    listeners,
    getDisplayMatching: ({ x, width }) => ([LAPTOP, ULTRAWIDE].find((display) => x + width / 2 >= display.bounds.x && x + width / 2 < display.bounds.x + display.bounds.width) ?? LAPTOP),
    on: (event, listener) => listeners.set(event, listener),
    removeListener: (event) => listeners.delete(event),
  };
};
const fakeWindow = (bounds) => {
  const listeners = new Map();
  return { bounds, listeners, destroyed: false, isDestroyed() { return this.destroyed; }, getBounds() { return this.bounds; }, on: (event, listener) => listeners.set(event, listener), removeListener: (event) => listeners.delete(event) };
};
const fakeNotch = (display, activeRequestId = 'startup-notch') => ({ activeRequestId, currentDisplay: () => display });
const onLaptop = { x: 100, y: 60, width: 1280, height: 820 };
const onUltrawide = { x: 1512 + 640, y: 60, width: 1280, height: 820 };

test('diz "sim" só quando o mascote está na tela e na mesma tela da janela', () => {
  const screen = fakeScreen();
  assert.equal(mascotSharesDisplay({ window: fakeWindow(onUltrawide), screen, notch: fakeNotch(ULTRAWIDE) }), true);
  assert.equal(mascotSharesDisplay({ window: fakeWindow(onLaptop), screen, notch: fakeNotch(ULTRAWIDE) }), false);
  assert.equal(mascotSharesDisplay({ window: fakeWindow(onLaptop), screen, notch: fakeNotch(LAPTOP) }), true);
  // Sem mascote no ar, sem janela ou com uma leitura que falha: a barra fica em cima.
  assert.equal(mascotSharesDisplay({ window: fakeWindow(onUltrawide), screen, notch: fakeNotch(ULTRAWIDE, null) }), false);
  assert.equal(mascotSharesDisplay({ window: null, screen, notch: fakeNotch(ULTRAWIDE) }), false);
  const closed = fakeWindow(onUltrawide); closed.destroyed = true;
  assert.equal(mascotSharesDisplay({ window: closed, screen, notch: fakeNotch(ULTRAWIDE) }), false);
  assert.equal(mascotSharesDisplay({ window: { getBounds() { throw new Error('destruída'); } }, screen, notch: fakeNotch(ULTRAWIDE) }), false);
});

test('avisa a janela quando ela passa para a tela do mascote e quando sai dela, e só então', () => {
  const screen = fakeScreen();
  const window = fakeWindow(onLaptop);
  const sent = [];
  const placement = createMascotPlacement({ window, screen, notch: () => fakeNotch(ULTRAWIDE), send: (state) => sent.push(state.sharesDisplay) });
  assert.deepEqual(placement.current(), { sharesDisplay: false });

  window.bounds = { ...onLaptop, x: 140 };
  window.listeners.get('move')();
  assert.deepEqual(sent, [], 'arrastar dentro da mesma tela não avisa');
  window.bounds = onUltrawide;
  window.listeners.get('move')();
  window.listeners.get('moved')();
  assert.deepEqual(sent, [true]);
  window.bounds = onLaptop;
  window.listeners.get('leave-full-screen')();
  assert.deepEqual(sent, [true, false]);
});

test('não avisa nada antes de a janela perguntar', () => {
  const screen = fakeScreen();
  const window = fakeWindow(onLaptop);
  const sent = [];
  const placement = createMascotPlacement({ window, screen, notch: () => fakeNotch(ULTRAWIDE), send: (state) => sent.push(state.sharesDisplay) });
  window.bounds = onUltrawide;
  window.listeners.get('moved')();
  assert.deepEqual(sent, []);
  // A pergunta traz a resposta de agora; a partir dela, cada mudança vira aviso.
  assert.deepEqual(placement.current(), { sharesDisplay: true });
  window.bounds = onLaptop;
  window.listeners.get('moved')();
  assert.deepEqual(sent, [false]);
});

test('reage a monitores e à troca de tela do mascote, e para de ouvir ao descartar', () => {
  const screen = fakeScreen();
  const window = fakeWindow(onUltrawide);
  let notchDisplay = LAPTOP;
  const sent = [];
  const placement = createMascotPlacement({ window, screen, notch: () => fakeNotch(notchDisplay), send: (state) => sent.push(state.sharesDisplay) });
  placement.current();
  notchDisplay = ULTRAWIDE;
  screen.listeners.get('display-metrics-changed')();
  assert.deepEqual(sent, [true]);
  notchDisplay = LAPTOP;
  assert.deepEqual(placement.refresh(), { sharesDisplay: false });
  assert.deepEqual(sent, [true, false]);

  placement.dispose();
  assert.equal(window.listeners.size, 0);
  assert.equal(screen.listeners.size, 0);
});

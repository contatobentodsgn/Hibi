const assert = require('node:assert/strict');
const test = require('node:test');
const { createTabyShortcut } = require('./taby-shortcut.cjs');

function globalShortcutFake({ refuse = [], silentFailure = [] } = {}) {
  const held = new Map();
  const calls = [];
  return {
    calls,
    held,
    register(accelerator, handler) {
      calls.push(['register', accelerator]);
      if (refuse.includes(accelerator)) return false;
      if (!silentFailure.includes(accelerator)) held.set(accelerator, handler);
      return true;
    },
    unregister(accelerator) { calls.push(['unregister', accelerator]); held.delete(accelerator); },
    isRegistered(accelerator) { return held.has(accelerator); },
  };
}

const settingsFake = (accelerator) => { let current = { accelerator }; return { get: () => current, save: (value) => { current = value; return current; } }; };

test('registra o atalho salvo e chama o Taby quando a tecla é apertada', () => {
  const globalShortcut = globalShortcutFake();
  let chamadas = 0;
  const shortcut = createTabyShortcut({ globalShortcut, settings: settingsFake('Command+Shift+Space'), onTrigger: () => { chamadas += 1; } });

  assert.deepEqual(shortcut.apply(), { accelerator: 'Command+Shift+Space', status: 'active' });
  globalShortcut.held.get('Command+Shift+Space')();

  assert.equal(chamadas, 1);
});

test('trocar de atalho solta a tecla antiga, para não ficarem duas presas', () => {
  const globalShortcut = globalShortcutFake();
  const shortcut = createTabyShortcut({ globalShortcut, settings: settingsFake('Command+Shift+Space'), onTrigger: () => undefined });
  shortcut.apply();

  assert.deepEqual(shortcut.set('Option+Space'), { accelerator: 'Option+Space', status: 'active' });
  assert.deepEqual([...globalShortcut.held.keys()], ['Option+Space']);
  assert.ok(globalShortcut.calls.some(([kind, accelerator]) => kind === 'unregister' && accelerator === 'Command+Shift+Space'));
});

test('uma tecla que já é de outro app vira estado, e o atalho escolhido continua à vista', () => {
  const globalShortcut = globalShortcutFake({ refuse: ['Command+Shift+Space'] });
  const shortcut = createTabyShortcut({ globalShortcut, settings: settingsFake('Command+Shift+Space'), onTrigger: () => undefined });

  assert.deepEqual(shortcut.apply(), { accelerator: 'Command+Shift+Space', status: 'taken' });
  assert.deepEqual([...globalShortcut.held.keys()], []);
});

test('um registro que diz sim sem prender a tecla não é dado como ativo', () => {
  const globalShortcut = globalShortcutFake({ silentFailure: ['Command+Shift+Space'] });
  const shortcut = createTabyShortcut({ globalShortcut, settings: settingsFake('Command+Shift+Space'), onTrigger: () => undefined });

  assert.equal(shortcut.apply().status, 'taken');
});

test('desligado não prende tecla nenhuma', () => {
  const globalShortcut = globalShortcutFake();
  const shortcut = createTabyShortcut({ globalShortcut, settings: settingsFake(null), onTrigger: () => undefined });

  assert.deepEqual(shortcut.apply(), { accelerator: null, status: 'disabled' });
  assert.deepEqual(globalShortcut.calls, []);
});

test('um atalho inválido é recusado antes de chegar ao sistema', () => {
  const globalShortcut = globalShortcutFake();
  const shortcut = createTabyShortcut({ globalShortcut, settings: settingsFake('Command+Shift+Space'), onTrigger: () => undefined });
  shortcut.apply();

  assert.throws(() => shortcut.set('Space'), /Invalid shortcut/);
  assert.deepEqual([...globalShortcut.held.keys()], ['Command+Shift+Space'], 'o atalho que funcionava continua valendo');
});

test('ao encerrar, o app devolve a tecla ao sistema', () => {
  const globalShortcut = globalShortcutFake();
  const shortcut = createTabyShortcut({ globalShortcut, settings: settingsFake('Command+Shift+Space'), onTrigger: () => undefined });
  shortcut.apply();

  shortcut.dispose();

  assert.deepEqual([...globalShortcut.held.keys()], []);
});

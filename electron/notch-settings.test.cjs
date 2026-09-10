const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createNotchSettings, applyNotchDisplay, notchDisplayState } = require('./notch-settings.cjs');

const tempFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hibi-notch-settings-')), 'notch-settings.json');
const lg = { id: 2, label: 'LG ULTRAWIDE', primary: true, internal: false, hasCameraHousing: false, width: 2560, height: 1080 };
const internal = { id: 1, label: 'Color LCD', primary: false, internal: true, hasCameraHousing: true, width: 1470, height: 956 };
const fakeManager = () => {
  const calls = [];
  let preferred = null;
  return {
    calls,
    setPreferredDisplay: (displayId) => { calls.push(displayId); preferred = displayId; },
    describeDisplays: () => ({ resolvedDisplayId: preferred ?? 1, reason: preferred ? 'preferred' : 'camera-housing', displays: [lg, internal] }),
  };
};

test('começa no automático e guarda a escolha entre instâncias', () => {
  const settings = createNotchSettings({ filePath: tempFile() });
  assert.deepEqual(settings.get(), { displayId: null, displayLabel: '' });

  assert.deepEqual(settings.save({ displayId: 2, displayLabel: '  LG ULTRAWIDE  ' }), { displayId: 2, displayLabel: 'LG ULTRAWIDE' });
  assert.deepEqual(createNotchSettings({ filePath: settings.filePath }).get(), { displayId: 2, displayLabel: 'LG ULTRAWIDE' });
  assert.equal(fs.statSync(settings.filePath).mode & 0o777, 0o600);

  assert.deepEqual(settings.save({ displayId: null, displayLabel: 'ignorado' }), { displayId: null, displayLabel: '' });
});

test('limita o rótulo a 120 caracteres', () => {
  const settings = createNotchSettings({ filePath: tempFile() });
  assert.equal(settings.save({ displayId: 3, displayLabel: 'x'.repeat(200) }).displayLabel.length, 120);
});

test('recusa valores inválidos sem gravar', () => {
  const settings = createNotchSettings({ filePath: tempFile() });
  for (const value of [null, {}, { displayId: 0 }, { displayId: -1 }, { displayId: 1.5 }, { displayId: '2' }, { displayId: 4_294_967_296 }, { displayId: 2, displayLabel: 5 }]) {
    assert.throws(() => settings.save(value), /Invalid notch settings/);
  }
  assert.equal(fs.existsSync(settings.filePath), false);
});

test('arquivo corrompido ou com conteúdo inválido volta ao automático', () => {
  const filePath = tempFile();
  fs.writeFileSync(filePath, '{ nope');
  assert.deepEqual(createNotchSettings({ filePath }).get(), { displayId: null, displayLabel: '' });
  fs.writeFileSync(filePath, JSON.stringify({ displayId: 'x' }));
  assert.deepEqual(createNotchSettings({ filePath }).get(), { displayId: null, displayLabel: '' });
});

test('applyNotchDisplay salva o monitor conectado com o rótulo atual e aplica no gerenciador', () => {
  const settings = createNotchSettings({ filePath: tempFile() });
  const manager = fakeManager();

  const chosen = applyNotchDisplay(settings, manager, 2);
  assert.deepEqual(chosen, { preference: { displayId: 2, displayLabel: 'LG ULTRAWIDE' }, resolvedDisplayId: 2, reason: 'preferred', displays: [lg, internal] });

  const automatic = applyNotchDisplay(settings, manager, null);
  assert.deepEqual(automatic.preference, { displayId: null, displayLabel: '' });
  assert.deepEqual(manager.calls, [2, null]);
  assert.deepEqual(notchDisplayState(settings, manager), automatic);
});

test('applyNotchDisplay recusa monitor desconectado ou id inválido sem salvar nem aplicar', () => {
  const settings = createNotchSettings({ filePath: tempFile() });
  const manager = fakeManager();
  for (const value of [9, '2', 2.5, undefined]) assert.throws(() => applyNotchDisplay(settings, manager, value), /Invalid notch display/);
  assert.deepEqual(settings.get(), { displayId: null, displayLabel: '' });
  assert.deepEqual(manager.calls, []);
});

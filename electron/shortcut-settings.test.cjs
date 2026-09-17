const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createShortcutSettings, normalizeAccelerator, DEFAULT_ACCELERATOR } = require('./shortcut-settings.cjs');

const fileIn = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hibi-shortcut-')), 'shortcut-settings.json');

test('recusa atalhos que sequestrariam uma tecla solta do sistema', () => {
  for (const value of ['Space', 'A', 'Command', '+', 'Command+', 'Command+Shift', 'Command+Ç', 'Command+Command+A', 'Meta+A', 'Alt+Space', 'CommandOrControl+Space', `Command+${'A'.repeat(60)}`, 42, {}]) {
    assert.throws(() => normalizeAccelerator(value), /Invalid shortcut/, `${JSON.stringify(value)} não pode virar atalho`);
  }
});

test('aceita combinação com modificador e tecla conhecida, e o desligado', () => {
  assert.equal(normalizeAccelerator('Command+Shift+Space'), 'Command+Shift+Space');
  assert.equal(normalizeAccelerator('Option+Space'), 'Option+Space');
  assert.equal(normalizeAccelerator('Control+Shift+F5'), 'Control+Shift+F5');
  assert.equal(normalizeAccelerator(null), null);
  assert.equal(normalizeAccelerator(''), null);
});

test('sem arquivo, o atalho nasce ligado no padrão', () => {
  assert.deepEqual(createShortcutSettings({ filePath: fileIn() }).get(), { accelerator: DEFAULT_ACCELERATOR });
});

test('desligar é uma escolha que sobrevive ao reinício, e não volta ao padrão', () => {
  const filePath = fileIn();
  createShortcutSettings({ filePath }).save({ accelerator: null });

  assert.deepEqual(createShortcutSettings({ filePath }).get(), { accelerator: null });
});

test('um arquivo corrompido não impede o app de abrir', () => {
  const filePath = fileIn();
  fs.writeFileSync(filePath, '{ isto não é json');

  assert.deepEqual(createShortcutSettings({ filePath }).get(), { accelerator: DEFAULT_ACCELERATOR });
});

test('guarda o atalho só para quem tem a conta, como os outros ajustes', () => {
  const filePath = fileIn();
  const saved = createShortcutSettings({ filePath }).save({ accelerator: 'Option+Space' });

  assert.deepEqual(saved, { accelerator: 'Option+Space' });
  assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
});

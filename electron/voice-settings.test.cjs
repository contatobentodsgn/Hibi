const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createVoiceSettings } = require('./voice-settings.cjs');

const fileIn = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hibi-voice-settings-')), 'voice-settings.json');

test('sem arquivo, o atalho só abre o Assistant e nada é lido em voz alta', () => {
  assert.deepEqual(createVoiceSettings({ filePath: fileIn() }).get(), { shortcutVoice: 'off', spokenReplies: false });
});

test('grava uma escolha sem apagar a outra, e ela sobrevive ao reinício', () => {
  const filePath = fileIn();
  createVoiceSettings({ filePath }).save({ shortcutVoice: 'notch' });
  createVoiceSettings({ filePath }).save({ spokenReplies: true });

  assert.deepEqual(createVoiceSettings({ filePath }).get(), { shortcutVoice: 'notch', spokenReplies: true });
  assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
});

test('recusa valores que não existem e não grava nada', () => {
  const filePath = fileIn();
  const settings = createVoiceSettings({ filePath });
  for (const patch of [{ shortcutVoice: 'sempre' }, { spokenReplies: 'sim' }, { shortcutVoice: null }]) assert.throws(() => settings.save(patch), /Invalid voice settings/);
  assert.equal(fs.existsSync(filePath), false);
});

test('um arquivo corrompido volta ao padrão', () => {
  const filePath = fileIn();
  fs.writeFileSync(filePath, '{ quebrado');
  assert.deepEqual(createVoiceSettings({ filePath }).get(), { shortcutVoice: 'off', spokenReplies: false });
});

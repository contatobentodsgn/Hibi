const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createConnectorSettings, normalizeEndpoint, normalizeTargets } = require('./connector-settings.cjs');

const tempFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hibi-connector-settings-')), 'connectors.json');

test('guarda endpoint, client id e alvos escolhidos por conector', () => {
  const settings = createConnectorSettings({ filePath: tempFile() });
  assert.deepEqual(settings.get('slack'), { endpoint: '', clientId: '', targets: [] });

  const saved = settings.save('slack', { endpoint: 'https://slack.com/api', clientId: 'client.123', targets: [{ id: 'C1', label: '#geral' }] });
  assert.deepEqual(saved, { endpoint: 'https://slack.com/api/', clientId: 'client.123', targets: [{ id: 'C1', label: '#geral' }] });
  assert.deepEqual(createConnectorSettings({ filePath: settings.filePath }).get('slack'), saved);
});

test('preserva os campos não informados em uma atualização parcial', () => {
  const settings = createConnectorSettings({ filePath: tempFile() });
  settings.save('email', { endpoint: 'https://mail.example.test', clientId: 'client-1' });
  const next = settings.save('email', { targets: [{ id: 'INBOX' }] });
  assert.deepEqual(next, { endpoint: 'https://mail.example.test/', clientId: 'client-1', targets: [{ id: 'INBOX', label: 'INBOX' }] });
});

test('recusa endpoints inseguros ou com dados embutidos', () => {
  const settings = createConnectorSettings({ filePath: tempFile() });
  assert.throws(() => settings.save('slack', { endpoint: 'http://slack.com/api' }), /must use HTTPS/);
  assert.throws(() => settings.save('slack', { endpoint: 'https://user:senha@slack.com/api' }), /must not embed credentials/);
  assert.throws(() => settings.save('slack', { endpoint: 'https://slack.com/api?token=abc' }), /query or fragment/);
  assert.throws(() => settings.save('slack', { endpoint: 'nao-e-url' }), /invalid/);
  assert.equal(normalizeEndpoint(''), '');
});

test('remove alvos duplicados e recusa seleções inválidas', () => {
  assert.deepEqual(normalizeTargets([{ id: 'a', label: 'A' }, { id: 'a', label: 'A repetido' }]), [{ id: 'a', label: 'A repetido' }]);
  assert.throws(() => normalizeTargets([{ label: 'sem id' }]), /invalid/);
  assert.throws(() => normalizeTargets(new Array(51).fill({ id: 'x' })), /invalid/);
});

test('grava o arquivo apenas com permissão do dono e ignora entradas corrompidas', () => {
  const filePath = tempFile();
  const settings = createConnectorSettings({ filePath });
  settings.save('notion', { clientId: 'client-1' });
  assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);

  fs.writeFileSync(filePath, JSON.stringify({ notion: { clientId: 'client-1' }, slack: { endpoint: 'http://inseguro.test' }, 'ID INVÁLIDO': {} }));
  assert.deepEqual(Object.keys(createConnectorSettings({ filePath }).all()), ['notion']);
});

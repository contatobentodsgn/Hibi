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

test('persiste o estado limitado da sincronização do Notion sem segredos', () => {
  const settings = createConnectorSettings({ filePath: tempFile() });
  const notion = {
    workspaceLabel: "Kizuna Std's Notion", parentPageId: 'page-kizuna', databaseId: 'db-1', dataSourceId: 'source-1',
    lastSyncAt: '2026-09-09T21:00:00.000Z', lastSummary: { imported: 2, pushed: 1, updated: 3, skipped: 0, failed: 1, conflicts: 1 },
    checkpoints: [{ localId: 'task-1', remoteId: 'remote-1', localHash: '89abcdef', remoteRevision: '2026-09-09T20:00:00.000Z' }],
  };
  const saved = settings.save('notion', { notion });
  assert.deepEqual(saved.notion, notion);
  assert.equal(JSON.stringify(saved).includes('token'), false);
});

test('recusa estado do Notion corrompido e preserva configuração legada', () => {
  const settings = createConnectorSettings({ filePath: tempFile() });
  settings.save('notion', { clientId: 'legacy' });
  assert.throws(() => settings.save('notion', { notion: { dataSourceId: 'x', checkpoints: [{ localId: '' }] } }), /Notion sync settings/);
  assert.equal(settings.get('notion').clientId, 'legacy');
});

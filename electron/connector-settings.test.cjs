const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createConnectorSettings, normalizeEndpoint, normalizeOauthUrl, normalizeTargets } = require('./connector-settings.cjs');

const tempFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hibi-connector-settings-')), 'connectors.json');

test('guarda endpoint, client id e alvos escolhidos por conector', () => {
  const settings = createConnectorSettings({ filePath: tempFile() });
  assert.deepEqual(settings.get('slack'), { endpoint: '', clientId: '', targets: [], authorizationUrl: '', tokenUrl: '', reconnectRequired: false });

  const saved = settings.save('slack', { endpoint: 'https://slack.com/api', clientId: 'client.123', targets: [{ id: 'C1', label: '#geral' }] });
  assert.deepEqual(saved, { endpoint: 'https://slack.com/api/', clientId: 'client.123', targets: [{ id: 'C1', label: '#geral' }], authorizationUrl: '', tokenUrl: '', reconnectRequired: false });
  assert.deepEqual(createConnectorSettings({ filePath: settings.filePath }).get('slack'), saved);
});

test('preserva os campos não informados em uma atualização parcial', () => {
  const settings = createConnectorSettings({ filePath: tempFile() });
  settings.save('email', { endpoint: 'https://mail.example.test', clientId: 'client-1' });
  const next = settings.save('email', { targets: [{ id: 'INBOX' }] });
  assert.deepEqual(next, { endpoint: 'https://mail.example.test/', clientId: 'client-1', targets: [{ id: 'INBOX', label: 'INBOX' }], authorizationUrl: '', tokenUrl: '', reconnectRequired: false });
});

test('guarda as URLs de OAuth do conector com a mesma barreira do endpoint', () => {
  const settings = createConnectorSettings({ filePath: tempFile() });
  const saved = settings.save('slack', { endpoint: 'https://slack.interno.example/api', authorizationUrl: 'https://login.interno.example/oauth/authorize', tokenUrl: 'https://login.interno.example/oauth/token' });

  // O caminho precisa sobreviver intacto: uma barra a mais troca a rota de autorização.
  assert.equal(saved.authorizationUrl, 'https://login.interno.example/oauth/authorize');
  assert.equal(saved.tokenUrl, 'https://login.interno.example/oauth/token');
  assert.deepEqual(createConnectorSettings({ filePath: settings.filePath }).get('slack'), saved);
});

test('recusa URLs de OAuth inseguras ou com dados embutidos', () => {
  const settings = createConnectorSettings({ filePath: tempFile() });
  assert.throws(() => settings.save('slack', { authorizationUrl: 'http://login.interno.example/oauth/authorize' }), /must use HTTPS/);
  assert.throws(() => settings.save('slack', { tokenUrl: 'https://user:senha@login.interno.example/oauth/token' }), /must not embed credentials/);
  assert.throws(() => settings.save('slack', { authorizationUrl: 'https://login.interno.example/oauth/authorize?tenant=1' }), /query or fragment/);
  assert.throws(() => settings.save('slack', { tokenUrl: 'nao-e-url' }), /invalid/);
  assert.equal(normalizeOauthUrl(''), '');
  assert.equal(settings.get('slack').authorizationUrl, '');
});

test('uma URL de OAuth pode ser guardada sozinha, sem virar meia configuração válida', () => {
  const settings = createConnectorSettings({ filePath: tempFile() });
  const saved = settings.save('slack', { authorizationUrl: 'https://login.interno.example/oauth/authorize' });
  assert.equal(saved.authorizationUrl, 'https://login.interno.example/oauth/authorize');
  assert.equal(saved.tokenUrl, '');
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
  // `tokenUrl` é configuração declarada pela pessoa, não segredo: a asserção olha
  // o estado do Notion, que é onde um token poderia vazar.
  assert.equal(JSON.stringify(saved.notion).includes('token'), false);
  assert.equal(saved.tokenUrl, '');
});

test('recusa estado do Notion corrompido e preserva configuração legada', () => {
  const settings = createConnectorSettings({ filePath: tempFile() });
  settings.save('notion', { clientId: 'legacy' });
  assert.throws(() => settings.save('notion', { notion: { dataSourceId: 'x', checkpoints: [{ localId: '' }] } }), /Notion sync settings/);
  assert.equal(settings.get('notion').clientId, 'legacy');
});

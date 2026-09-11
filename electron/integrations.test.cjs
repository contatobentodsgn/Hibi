const test = require('node:test');
const assert = require('node:assert/strict');
const { createIntegrationManager, createReadOnlyFetch, createSafeIntegrationFetch, sanitizeIntegrationAudit } = require('./integrations.cjs');
const { createSlackConnector } = require('./connectors/slack.cjs');

const keychain = () => {
  const values = new Map();
  return {
    set: async (account, secret) => values.set(account, secret),
    get: async (account) => values.get(account),
    has: async (account) => values.has(account),
    remove: async (account) => values.delete(account),
  };
};

const connector = {
  id: 'fixture', label: 'Fixture', allowedHosts: ['api.fixture.test'],
  capabilities: ['import', 'write'],
  executeApproved: async (action) => ({ ok: true, remoteId: `remote-${action.kind}` }),
};

test('exposes a secret-free connection status and retains credentials only by Keychain reference', async () => {
  const manager = createIntegrationManager({ connectors: [connector], keychain: keychain() });

  const status = await manager.connect('fixture', { credential: 'token-super-secret' });

  assert.deepEqual(status, { id: 'fixture', label: 'Fixture', state: 'connected', capabilities: ['import', 'write'], hasCredential: true });
  assert.equal(JSON.stringify(await manager.listStatus()).includes('super-secret'), false);
  assert.equal(JSON.stringify(await manager.audit()).includes('super-secret'), false);
});

test('allows only bounded HTTPS requests to the connector allowlist and redacts audit text', async () => {
  const calls = [];
  const request = createSafeIntegrationFetch({ connector, fetch: async (url, init) => { calls.push([url, init]); return new Response('ok', { status: 200 }); } });

  await request('https://api.fixture.test/v1/items', { method: 'GET' });
  await assert.rejects(() => request('http://api.fixture.test/v1/items'), /HTTPS/);
  await assert.rejects(() => request('https://other.fixture.test/v1/items'), /allowed/);
  assert.equal(calls.length, 1);
  assert.deepEqual(sanitizeIntegrationAudit({ action: 'connect', connectorId: 'fixture', detail: 'Authorization: Bearer token-super-secret' }), { action: 'connect', connectorId: 'fixture', detail: 'Authorization: [redacted]' });
});

test('prepares remote writes but blocks execution without the exact confirmation token', async () => {
  const manager = createIntegrationManager({ connectors: [connector], keychain: keychain() });
  await manager.connect('fixture', { credential: 'token-for-fixture' });
  const prepared = await manager.prepareAction({ connectorId: 'fixture', kind: 'slack.post', payload: { text: 'Hello' } });

  await assert.rejects(() => manager.executeApproved({ confirmationId: 'wrong-token', actionId: prepared.id }), /confirmation/i);
  const result = await manager.executeApproved({ confirmationId: prepared.confirmationId, actionId: prepared.id });

  assert.deepEqual(result, { ok: true, remoteId: 'remote-slack.post' });
  await assert.rejects(() => manager.executeApproved({ confirmationId: prepared.confirmationId, actionId: prepared.id }), /confirmation/i);
});

test('keeps a connector credential in the main-process execution context only', async () => {
  let received;
  const secureConnector = { ...connector, id: 'secure', executeApproved: async (action) => { received = action; return { ok: true }; } };
  const manager = createIntegrationManager({ connectors: [secureConnector], keychain: keychain() });
  await manager.connect('secure', { credential: 'token-main-process-only' });
  const prepared = await manager.prepareAction({ connectorId: 'secure', kind: 'remote.write', payload: { title: 'Safe' } });

  await manager.executeApproved({ confirmationId: prepared.confirmationId, actionId: prepared.id });

  assert.equal(received.credential, 'token-main-process-only');
  assert.equal(typeof received.request, 'function');
  assert.equal(JSON.stringify(prepared).includes('token-main-process-only'), false);
});

test('returns only a safe result summary when a connector responds with remote JSON', async () => {
  const responseConnector = { ...connector, id: 'response', executeApproved: async () => new Response(JSON.stringify({ id: 'remote-44', body: 'do not expose' }), { status: 201 }) };
  const manager = createIntegrationManager({ connectors: [responseConnector], keychain: keychain() });
  await manager.connect('response', { credential: 'token' });
  const prepared = await manager.prepareAction({ connectorId: 'response', kind: 'remote.write', payload: {} });

  const result = await manager.executeApproved({ confirmationId: prepared.confirmationId, actionId: prepared.id });

  assert.deepEqual(result, { ok: true, status: 201, remoteId: 'remote-44' });
  assert.equal(JSON.stringify(result).includes('do not expose'), false);
});

test('asks each connector to validate a remote action before it can be confirmed', async () => {
  let prepared;
  const validatingConnector = { ...connector, id: 'validating', prepareWrite: (input) => { prepared = input; if (input.kind !== 'allowed.write') throw new Error('Unsupported action.'); return { kind: input.kind, payload: { safe: true } }; } };
  const manager = createIntegrationManager({ connectors: [validatingConnector], keychain: keychain() });

  await assert.rejects(() => manager.prepareAction({ connectorId: 'validating', kind: 'arbitrary.write', payload: { unsafe: true } }), /Unsupported/);
  const action = await manager.prepareAction({ connectorId: 'validating', kind: 'allowed.write', payload: { ignored: true } });

  assert.deepEqual(prepared, { kind: 'allowed.write', payload: { ignored: true } });
  assert.equal(action.requiresConfirmation, true);
});

test('testa a conexão sem executar escrita e registra o resultado sanitizado', async () => {
  const store = keychain();
  await store.set('integration:fixture', 'token-secreto');
  const attempted = [];
  const manager = createIntegrationManager({ keychain: store, connectors: [{
    id: 'fixture', label: 'Fixture', allowedHosts: ['fixture.example.test'], capabilities: ['import', 'write'],
    async testConnection({ credential, request }) {
      attempted.push('read');
      // Uma tentativa de escrita durante o teste precisa ser barrada pelo próprio contrato.
      await assert.rejects(request('https://fixture.example.test/write', { method: 'POST', body: '{}' }), /cannot perform writes/);
      assert.equal(credential, 'token-secreto');
      return { detail: 'Connected as Fixture Bot.' };
    },
  }] });

  assert.deepEqual(await manager.testConnection('fixture'), { ok: true, detail: 'Connected as Fixture Bot.' });
  assert.deepEqual(attempted, ['read']);
  const [entry] = await manager.audit();
  assert.equal(entry.action, 'test-connection');
  assert.equal(entry.detail, 'Connected as Fixture Bot.');
});

test('reporta a falha do teste de conexão sem vazar a credencial', async () => {
  const store = keychain();
  await store.set('integration:fixture', 'token-secreto');
  const manager = createIntegrationManager({ keychain: store, connectors: [{
    id: 'fixture', label: 'Fixture', allowedHosts: ['fixture.example.test'], capabilities: ['import'],
    async testConnection() { throw new Error('Rejected token: token-secreto'); },
  }] });

  const result = await manager.testConnection('fixture');
  assert.equal(result.ok, false);
  assert.doesNotMatch(result.detail, /token-secreto/);
  assert.match(result.detail, /\[redacted\]/);
});

test('lista alvos de importação limitados e normalizados', async () => {
  const store = keychain();
  await store.set('integration:fixture', 'token');
  const manager = createIntegrationManager({ keychain: store, connectors: [{
    id: 'fixture', label: 'Fixture', allowedHosts: ['fixture.example.test'], capabilities: ['import'],
    async listImportTargets() { return [{ id: 'C1', label: '#geral' }, { id: 'C2' }, { label: 'sem id' }, null]; },
  }] });

  assert.deepEqual(await manager.listImportTargets('fixture'), [{ id: 'C1', label: '#geral' }, { id: 'C2', label: 'C2' }]);
  assert.equal((await manager.audit())[0].detail, 'Listed 2 import targets.');
});

test('o fetch somente leitura recusa corpo mesmo em GET', async () => {
  const request = createReadOnlyFetch(async () => ({ ok: true }));
  await assert.rejects(request('https://fixture.example.test/', { method: 'GET', body: '{}' }), /cannot send a request body/);
  assert.deepEqual(await request('https://fixture.example.test/'), { ok: true });
});

test('lê candidatos apenas das fontes escolhidas e normaliza pelo conector', async () => {
  const store = keychain();
  await store.set('integration:fixture', 'token');
  const asked = [];
  const manager = createIntegrationManager({ keychain: store, connectors: [{
    id: 'fixture', label: 'Fixture', allowedHosts: ['fixture.example.test'], capabilities: ['import'],
    async fetchImports({ targets }) { asked.push(targets.map((target) => target.id).join(',')); return [{ id: 'r1', title: 'Primeiro', rev: 'v1' }, { id: 'r2', title: 'Segundo' }, { semId: true }]; },
    normalizeImport(item) { return typeof item?.id === 'string' ? { remoteId: item.id, title: item.title, kind: 'task', ...(item.rev ? { revision: item.rev } : {}) } : null; },
  }] });

  const candidates = await manager.listImportCandidates('fixture', { targets: [{ id: 'db-1' }, { id: 'db-2' }] });
  assert.deepEqual(asked, ['db-1,db-2']);
  assert.deepEqual(candidates, [{ remoteId: 'r1', title: 'Primeiro', kind: 'task', revision: 'v1' }, { remoteId: 'r2', title: 'Segundo', kind: 'task' }]);
  assert.equal((await manager.audit())[0].detail, 'Read 2 items from 2 selected sources.');
});

test('recusa importar sem nenhuma fonte escolhida', async () => {
  const store = keychain();
  await store.set('integration:fixture', 'token');
  let fetched = false;
  const manager = createIntegrationManager({ keychain: store, connectors: [{
    id: 'fixture', label: 'Fixture', allowedHosts: ['fixture.example.test'], capabilities: ['import'],
    async fetchImports() { fetched = true; return []; },
    normalizeImport: () => null,
  }] });

  await assert.rejects(manager.listImportCandidates('fixture', { targets: [] }), /at least one source/);
  assert.equal(fetched, false);
});

test('recusa importar de um conector sem capacidade de importação', async () => {
  const store = keychain();
  await store.set('integration:fixture', 'token');
  const manager = createIntegrationManager({ keychain: store, connectors: [{ id: 'fixture', label: 'Fixture', allowedHosts: ['fixture.example.test'], capabilities: ['notify'] }] });
  await assert.rejects(manager.listImportCandidates('fixture', { targets: [{ id: 'x' }] }), /does not support importing/);
});

test('devolve resultados sanitizados por item em uma sincronização parcialmente concluída', async () => {
  const store = keychain();
  await store.set('integration:fixture', 'token');
  const batchConnector = {
    ...connector,
    prepareWrite: ({ kind, payload }) => ({ kind, payload }),
    executeApproved: async () => ({ ok: false, items: [
      { key: 'task-1', ok: true, status: 201, remoteId: 'page-1', revision: 'v1', body: 'private' },
      { key: 'task-2', ok: false, status: 429, error: 'Try later', token: 'secret' },
    ] }),
  };
  const manager = createIntegrationManager({ connectors: [batchConnector], keychain: store });
  const prepared = await manager.prepareAction({ connectorId: 'fixture', kind: 'notion.sync.batch', payload: { operations: [] } });
  const result = await manager.executeApproved({ actionId: prepared.id, confirmationId: prepared.confirmationId });
  assert.deepEqual(result, { ok: false, items: [
    { key: 'task-1', ok: true, status: 201, remoteId: 'page-1', revision: 'v1' },
    { key: 'task-2', ok: false, status: 429, error: 'Try later' },
  ] });
  assert.equal(JSON.stringify(result).includes('private'), false);
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('preserva apenas os campos mapeados de uma tarefa Notion importada', async () => {
  const store = keychain();
  await store.set('integration:fixture', 'token');
  const manager = createIntegrationManager({ keychain: store, connectors: [{
    id: 'fixture', label: 'Fixture', allowedHosts: ['fixture.example.test'], capabilities: ['import'],
    async fetchImports() { return [{ id: 'page-1' }]; },
    normalizeImport() { return { remoteId: 'page-1', revision: 'v1', hibiId: 'task-1', title: 'Mapped', status: 'paused', deadline: '2026-09-10T09:00:00-03:00', durationMinutes: 45, description: 'Safe description', kind: 'task', rawBody: 'private' }; },
  }] });
  const [candidate] = await manager.listImportCandidates('fixture', { targets: [{ id: 'source-1' }] });
  assert.deepEqual(candidate, { remoteId: 'page-1', revision: 'v1', hibiId: 'task-1', title: 'Mapped', status: 'paused', deadline: '2026-09-10T09:00:00-03:00', durationMinutes: 45, description: 'Safe description', kind: 'task' });
  assert.equal(JSON.stringify(candidate).includes('private'), false);
});

test('descobre uma fonte de dados sem devolver credencial ao renderer', async () => {
  const store = keychain();
  await store.set('integration:fixture', 'token-secret');
  let receivedCredential;
  const manager = createIntegrationManager({ keychain: store, connectors: [{
    id: 'fixture', label: 'Fixture', allowedHosts: ['fixture.example.test'], capabilities: ['import'],
    async discoverDataSource({ credential, databaseId }) { receivedCredential = credential; return { databaseId, dataSourceId: 'source-1', label: 'Hibi Tasks', token: credential }; },
  }] });
  const result = await manager.discoverDataSource('fixture', 'db-1');
  assert.equal(receivedCredential, 'token-secret');
  assert.deepEqual(result, { databaseId: 'db-1', dataSourceId: 'source-1', label: 'Hibi Tasks' });
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

// O Slack recusa uma chamada com HTTP 200 e `ok: false` no corpo. Olhando só a linha de
// status, uma postagem recusada volta idêntica a uma aceita: o app diz que executou, a
// auditoria registra a execução e nada foi postado.
test('uma recusa no corpo da resposta não vira escrita bem-sucedida', async () => {
  const store = keychain();
  await store.set('integration:slack', 'token-secreto');
  const manager = createIntegrationManager({
    connectors: [createSlackConnector()], keychain: store,
    fetch: async () => new Response(JSON.stringify({ ok: false, error: 'channel_not_found' }), { status: 200, headers: { 'content-type': 'application/json' } }),
  });
  const prepared = await manager.prepareAction({ connectorId: 'slack', kind: 'slack.post', payload: { channel: 'C1', text: 'RECUSA_SIMULADA' } });

  const result = await manager.executeApproved({ actionId: prepared.id, confirmationId: prepared.confirmationId });

  assert.equal(result.ok, false);
  assert.equal(result.status, 200);
  assert.match(result.error, /channel_not_found/);
  const [entry] = await manager.audit();
  assert.equal(entry.action, 'execute');
  assert.match(entry.detail, /refused/i);
  assert.equal(JSON.stringify(await manager.audit()).includes('token-secreto'), false);
});

// E-mail, notificações remotas e Notion sinalizam falha pelo código HTTP e nunca mandam
// `ok` no corpo: para eles o status continua sendo a única palavra, nos dois sentidos.
test('uma resposta sem a flag `ok` no corpo continua decidida pelo status HTTP', async () => {
  const store = keychain();
  await store.set('integration:fixture', 'token');
  const responses = [new Response(JSON.stringify({ id: 'sent-1' }), { status: 200 }), new Response(JSON.stringify({ error: 'mensagem inválida' }), { status: 400 })];
  const manager = createIntegrationManager({ connectors: [{ ...connector, executeApproved: async () => responses.shift() }], keychain: store });

  const accepted = await manager.prepareAction({ connectorId: 'fixture', kind: 'email.send', payload: {} });
  assert.deepEqual(await manager.executeApproved({ actionId: accepted.id, confirmationId: accepted.confirmationId }), { ok: true, status: 200, remoteId: 'sent-1' });

  const rejected = await manager.prepareAction({ connectorId: 'fixture', kind: 'email.send', payload: {} });
  const failure = await manager.executeApproved({ actionId: rejected.id, confirmationId: rejected.confirmationId });
  assert.equal(failure.ok, false);
  assert.equal(failure.status, 400);
});

test('extrai a revisão segura da resposta de página do Notion', async () => {
  const responseConnector = { ...connector, id: 'revision', executeApproved: async () => new Response(JSON.stringify({ id: 'page-1', last_edited_time: '2026-09-10T01:00:00.000Z' }), { status: 200 }) };
  const manager = createIntegrationManager({ connectors: [responseConnector], keychain: keychain() });
  await manager.connect('revision', { credential: 'token' });
  const prepared = await manager.prepareAction({ connectorId: 'revision', kind: 'remote.write', payload: {} });
  assert.deepEqual(await manager.executeApproved({ actionId: prepared.id, confirmationId: prepared.confirmationId }), { ok: true, status: 200, remoteId: 'page-1', revision: '2026-09-10T01:00:00.000Z' });
});

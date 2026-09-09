const test = require('node:test');
const assert = require('node:assert/strict');
const { createIntegrationManager, createReadOnlyFetch, createSafeIntegrationFetch, sanitizeIntegrationAudit } = require('./integrations.cjs');

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

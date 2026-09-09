const test = require('node:test');
const assert = require('node:assert/strict');
const { createIntegrationManager, createSafeIntegrationFetch, sanitizeIntegrationAudit } = require('./integrations.cjs');

const keychain = () => {
  const values = new Map();
  return {
    set: async (account, secret) => values.set(account, secret),
    get: async (account) => values.get(account),
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

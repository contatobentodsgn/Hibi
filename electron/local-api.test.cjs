const test = require('node:test');
const assert = require('node:assert/strict');
const { createLocalApi, createLocalApiTokenStore } = require('./local-api.cjs');

const keychain = () => { const values = new Map(); return { get: async (key) => values.get(key), set: async (key, value) => values.set(key, value), remove: async (key) => values.delete(key) }; };

const request = async (url, token, options = {}) => {
  const headers = { ...(options.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  return fetch(url, { ...options, headers })
}

test('binds only loopback, uses a revocable Keychain bearer token, and exposes safe reads', async () => {
  const store = createLocalApiTokenStore({ keychain: keychain() });
  const api = createLocalApi({ tokenStore: store, workspace: () => ({ tasks: [{ id: 't1', title: 'Review' }], reminders: [], blocks: [] }) });
  await assert.rejects(() => api.start({ host: '0.0.0.0', port: 0 }), /loopback/i);
  const { origin, token } = await api.start({ host: '127.0.0.1', port: 0 });
  try {
    assert.equal((await request(`${origin}/v1/tasks`)).status, 401);
    assert.deepEqual(await (await request(`${origin}/v1/tasks`, token)).json(), { tasks: [{ id: 't1', title: 'Review' }] });
    assert.equal((await request(`${origin}/openapi.json`, token)).status, 200);
  } finally { await api.stop(); }
});

test('returns a confirmation intent for writes and never executes the mutation through the API request', async () => {
  const prepared = [];
  const api = createLocalApi({ tokenStore: createLocalApiTokenStore({ keychain: keychain() }), workspace: () => ({ tasks: [], reminders: [], blocks: [] }), prepareWrite: async (intent) => { prepared.push(intent); return { confirmationId: 'confirm-1', requiresConfirmation: true }; } });
  const { origin, token } = await api.start({ host: '127.0.0.1', port: 0 });
  try {
    const response = await request(`${origin}/v1/tasks`, token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Create safely' }) });
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { confirmationId: 'confirm-1', requiresConfirmation: true });
    assert.deepEqual(prepared, [{ kind: 'task.create', payload: { title: 'Create safely' } }]);
  } finally { await api.stop(); }
});

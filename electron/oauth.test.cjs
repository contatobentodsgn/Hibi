const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const { createOAuthService, oauthConfigFor } = require('./oauth.cjs');

const connector = {
  id: 'fixture', label: 'Fixture', allowedHosts: ['service.example.test'], capabilities: ['import', 'write'],
  oauth: { pkce: true, authorizationUrl: 'https://service.example.test/oauth/authorize', tokenUrl: 'https://service.example.test/oauth/token', scopes: ['read', 'write'] },
};

function memoryKeychain() {
  const values = new Map();
  return {
    store: values,
    async set(account, secret) { values.set(account, secret); },
    async get(account) { const value = values.get(account); if (!value) throw new Error('missing'); return value; },
    async has(account) { return values.has(account); },
    async remove(account) { values.delete(account); },
  };
}

const jsonResponse = (body, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => body });

test('monta uma autorização PKCE com S256, state e callback de loopback', async () => {
  const keychain = memoryKeychain();
  let opened;
  const calls = [];
  const service = createOAuthService({
    keychain, getConnector: () => connector,
    openExternal: (url) => { opened = new URL(url); },
    fetch: async (url, init) => { calls.push({ url, body: init.body }); return jsonResponse({ access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600 }); },
    now: () => Date.parse('2026-09-09T12:00:00.000Z'),
  });

  const started = service.authorize('fixture', { clientId: 'client-123' });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(opened.origin, 'https://service.example.test');
  assert.equal(opened.searchParams.get('response_type'), 'code');
  assert.equal(opened.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(opened.searchParams.get('client_id'), 'client-123');
  assert.equal(opened.searchParams.get('scope'), 'read write');
  const redirectUri = new URL(opened.searchParams.get('redirect_uri'));
  assert.equal(redirectUri.hostname, '127.0.0.1');
  assert.equal(redirectUri.pathname, '/oauth/callback');
  const challenge = opened.searchParams.get('code_challenge');
  assert.match(challenge, /^[A-Za-z0-9_-]{43}$/);

  const state = opened.searchParams.get('state');
  const callback = await fetch(`${redirectUri.origin}/oauth/callback?state=${encodeURIComponent(state)}&code=auth-code-1`);
  assert.equal(callback.status, 200);

  const result = await started;
  assert.deepEqual(result, { connectorId: 'fixture', connected: true, hasRefreshToken: true, expiresAt: '2026-09-09T13:00:00.000Z' });

  // O verifier enviado na troca precisa corresponder ao challenge anunciado.
  const sent = new URLSearchParams(calls[0].body);
  assert.equal(calls[0].url, 'https://service.example.test/oauth/token');
  assert.equal(sent.get('grant_type'), 'authorization_code');
  assert.equal(sent.get('code'), 'auth-code-1');
  assert.equal(sent.get('redirect_uri'), redirectUri.toString());
  const derived = crypto.createHash('sha256').update(sent.get('code_verifier')).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.equal(derived, challenge);

  assert.equal(keychain.store.get('integration:fixture'), 'access-1');
  assert.equal(keychain.store.get('integration:fixture:refresh'), 'refresh-1');
});

test('recusa reutilizar o state do callback e encerra o servidor de loopback', async () => {
  const keychain = memoryKeychain();
  let opened;
  const service = createOAuthService({
    keychain, getConnector: () => connector,
    openExternal: (url) => { opened = new URL(url); },
    fetch: async () => jsonResponse({ access_token: 'access-1' }),
  });

  const started = service.authorize('fixture', { clientId: 'client-123' });
  await new Promise((resolve) => setImmediate(resolve));
  const redirectUri = new URL(opened.searchParams.get('redirect_uri'));
  const state = opened.searchParams.get('state');

  await fetch(`${redirectUri.origin}/oauth/callback?state=${encodeURIComponent(state)}&code=auth-code-1`);
  await started;
  assert.equal(service.isAwaitingCallback(), false);

  await assert.rejects(fetch(`${redirectUri.origin}/oauth/callback?state=${encodeURIComponent(state)}&code=auth-code-2`));
});

test('rejeita um state divergente sem trocar o código por um token', async () => {
  const keychain = memoryKeychain();
  let opened;
  let exchanges = 0;
  const service = createOAuthService({
    keychain, getConnector: () => connector,
    openExternal: (url) => { opened = new URL(url); },
    fetch: async () => { exchanges += 1; return jsonResponse({ access_token: 'access-1' }); },
    timeoutMs: 60,
  });

  const started = service.authorize('fixture', { clientId: 'client-123' });
  const settled = started.then(() => null, (error) => error);
  await new Promise((resolve) => setImmediate(resolve));
  const redirectUri = new URL(opened.searchParams.get('redirect_uri'));

  const rejected = await fetch(`${redirectUri.origin}/oauth/callback?state=state-falsificado&code=auth-code-1`);
  assert.equal(rejected.status, 400);

  assert.match((await settled).message, /timed out/);
  assert.equal(exchanges, 0);
  assert.equal(keychain.store.size, 0);
});

test('propaga a recusa do servidor de autorização sem armazenar credencial', async () => {
  const keychain = memoryKeychain();
  let opened;
  const service = createOAuthService({ keychain, getConnector: () => connector, openExternal: (url) => { opened = new URL(url); }, fetch: async () => jsonResponse({}, false) });

  const started = service.authorize('fixture', { clientId: 'client-123' });
  // A rejeição precisa ter um tratador antes do callback disparar.
  const settled = started.then(() => null, (error) => error);
  await new Promise((resolve) => setImmediate(resolve));
  const redirectUri = new URL(opened.searchParams.get('redirect_uri'));
  await fetch(`${redirectUri.origin}/oauth/callback?state=${encodeURIComponent(opened.searchParams.get('state'))}&error=access_denied`);

  assert.match((await settled).message, /rejected this authorization/);
  assert.equal(keychain.store.size, 0);
});

test('renova o token usando o refresh token guardado e aceita a rotação', async () => {
  const keychain = memoryKeychain();
  keychain.store.set('integration:fixture', 'access-antigo');
  keychain.store.set('integration:fixture:refresh', 'refresh-antigo');
  const bodies = [];
  const service = createOAuthService({
    keychain, getConnector: () => connector, openExternal: () => undefined,
    fetch: async (_url, init) => { bodies.push(new URLSearchParams(init.body)); return jsonResponse({ access_token: 'access-novo', refresh_token: 'refresh-novo' }); },
  });

  const result = await service.refresh('fixture', { clientId: 'client-123' });
  assert.deepEqual(result, { connectorId: 'fixture', connected: true, hasRefreshToken: true });
  assert.equal(bodies[0].get('grant_type'), 'refresh_token');
  assert.equal(bodies[0].get('refresh_token'), 'refresh-antigo');
  assert.equal(keychain.store.get('integration:fixture'), 'access-novo');
  assert.equal(keychain.store.get('integration:fixture:refresh'), 'refresh-novo');
});

test('recusa renovar sem refresh token guardado', async () => {
  const service = createOAuthService({ keychain: memoryKeychain(), getConnector: () => connector, openExternal: () => undefined, fetch: async () => jsonResponse({ access_token: 'x' }) });
  await assert.rejects(service.refresh('fixture', { clientId: 'client-123' }), /No refresh token is stored/);
});

test('revoga o acesso e o refresh token do Keychain', async () => {
  const keychain = memoryKeychain();
  keychain.store.set('integration:fixture', 'access');
  keychain.store.set('integration:fixture:refresh', 'refresh');
  const service = createOAuthService({ keychain, getConnector: () => connector, openExternal: () => undefined, fetch: async () => jsonResponse({}) });
  assert.deepEqual(await service.revoke('fixture'), { connectorId: 'fixture', connected: false, hasRefreshToken: false });
  assert.equal(keychain.store.size, 0);
});

test('exige client id e PKCE declarado pelo conector', async () => {
  const service = createOAuthService({ keychain: memoryKeychain(), getConnector: (id) => id === 'fixture' ? connector : { id, label: id, allowedHosts: ['x.example.test'], capabilities: [] }, openExternal: () => undefined, fetch: async () => jsonResponse({}) });
  await assert.rejects(service.authorize('fixture', { clientId: '' }), /client identifier/);
  await assert.rejects(service.authorize('sem-oauth', { clientId: 'client-123' }), /does not support the PKCE/);
  assert.equal(service.supports('fixture'), true);
  assert.equal(service.supports('sem-oauth'), false);
});

test('recusa endpoints fora do allowlist do conector ou sem HTTPS', () => {
  assert.throws(() => oauthConfigFor({ allowedHosts: ['service.example.test'], oauth: { pkce: true, authorizationUrl: 'http://service.example.test/a', tokenUrl: 'https://service.example.test/t' } }), /requires HTTPS/);
  assert.throws(() => oauthConfigFor({ allowedHosts: ['service.example.test'], oauth: { pkce: true, authorizationUrl: 'https://atacante.example.test/a', tokenUrl: 'https://service.example.test/t' } }), /not allowed for this connector/);
  assert.throws(() => oauthConfigFor({ allowedHosts: ['service.example.test'], oauth: { pkce: true, authorizationUrl: 'https://service.example.test/a', tokenUrl: 'https://atacante.example.test/t' } }), /not allowed for this connector/);
});

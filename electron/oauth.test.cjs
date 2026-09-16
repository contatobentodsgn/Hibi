const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createOAuthService, oauthConfigFor } = require('./oauth.cjs');
const { createConnectorSettings } = require('./connector-settings.cjs');
const { buildConnectors } = require('./connectors/index.cjs');

// Os conectores de verdade, montados como o processo principal os monta: é aí que
// endpoint configurado e URL de OAuth fixa se encontram.
const tempSettings = () => createConnectorSettings({ filePath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hibi-oauth-settings-')), 'connectors.json') });
const shippedConnector = (settings, id) => buildConnectors(settings).find((connector) => connector.id === id);

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

test('preserves validated provider authorization parameters without replacing PKCE fields', async () => {
  const keychain = memoryKeychain();
  let opened;
  const google = {
    id: 'google-calendar', label: 'Google Calendar', allowedHosts: ['accounts.google.com', 'oauth2.googleapis.com'], capabilities: ['import'],
    oauth: { pkce: true, authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token', scopes: ['https://www.googleapis.com/auth/calendar'], authorizationParams: { access_type: 'offline', prompt: 'consent' } },
  };
  const service = createOAuthService({ keychain, getConnector: () => google, openExternal: (url) => { opened = new URL(url); }, fetch: async () => jsonResponse({ access_token: 'access-1', refresh_token: 'refresh-1' }) });

  const pending = service.authorize('google-calendar', { clientId: 'client-123' });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(opened.searchParams.get('access_type'), 'offline');
  assert.equal(opened.searchParams.get('prompt'), 'consent');
  assert.equal(opened.searchParams.get('code_challenge_method'), 'S256');
  await service.cancel();
  await assert.rejects(pending, /cancelled/);
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

test('mantém o OAuth embutido do Slack enquanto o endpoint padrão não é trocado', () => {
  const config = oauthConfigFor(shippedConnector(tempSettings(), 'slack'));
  assert.equal(config.authorizationUrl.toString(), 'https://slack.com/oauth/v2/authorize');
  assert.equal(config.tokenUrl.toString(), 'https://slack.com/api/oauth.v2.access');
  assert.deepEqual(config.scopes, ['chat:write', 'stars:read']);
});

test('um endpoint próprio sem URLs de OAuth desliga o OAuth em vez de recusar a URL embutida', () => {
  const settings = tempSettings();
  settings.save('slack', { endpoint: 'https://slack.interno.example/api' });
  const slack = shippedConnector(settings, 'slack');
  const service = createOAuthService({ keychain: memoryKeychain(), getConnector: () => slack, openExternal: () => undefined, fetch: async () => jsonResponse({}) });

  assert.equal(slack.oauth, undefined);
  assert.equal(service.supports('slack'), false);
  // A ausência é honesta; o erro de allowlist seria uma promessa quebrada.
  assert.throws(() => oauthConfigFor(slack), /does not support the PKCE/);
});

test('só considera o OAuth configurado quando as duas URLs existem', () => {
  const settings = tempSettings();
  settings.save('slack', { endpoint: 'https://slack.interno.example/api', authorizationUrl: 'https://login.interno.example/oauth/authorize' });
  assert.equal(shippedConnector(settings, 'slack').oauth, undefined);

  settings.save('slack', { tokenUrl: 'https://login.interno.example/oauth/token' });
  assert.equal(shippedConnector(settings, 'slack').oauth?.authorizationUrl, 'https://login.interno.example/oauth/authorize');
});

test('autoriza um conector entregue usando as URLs de OAuth configuradas com o endpoint', async () => {
  const settings = tempSettings();
  settings.save('slack', { endpoint: 'https://slack.interno.example/api', authorizationUrl: 'https://login.interno.example/oauth/authorize', tokenUrl: 'https://login.interno.example/oauth/token' });
  const slack = shippedConnector(settings, 'slack');
  const keychain = memoryKeychain();
  const calls = [];
  let opened;
  const service = createOAuthService({
    keychain, getConnector: () => slack,
    openExternal: (url) => { opened = new URL(url); },
    fetch: async (url, init) => { calls.push({ url, body: init.body }); return jsonResponse({ access_token: 'access-1' }); },
  });

  assert.equal(service.supports('slack'), true);
  const started = service.authorize('slack', { clientId: 'client-slack-1' });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(`${opened.origin}${opened.pathname}`, 'https://login.interno.example/oauth/authorize');
  assert.equal(opened.searchParams.get('scope'), 'chat:write stars:read');
  const redirectUri = new URL(opened.searchParams.get('redirect_uri'));
  await fetch(`${redirectUri.origin}/oauth/callback?state=${encodeURIComponent(opened.searchParams.get('state'))}&code=auth-code-1`);

  assert.deepEqual(await started, { connectorId: 'slack', connected: true, hasRefreshToken: false });
  assert.equal(calls[0].url, 'https://login.interno.example/oauth/token');
  assert.equal(keychain.store.get('integration:slack'), 'access-1');
});

test('o conector de e-mail não anuncia mais o OAuth do placeholder inexistente', () => {
  const settings = tempSettings();
  assert.equal(shippedConnector(settings, 'email').oauth, undefined);
  settings.save('email', { authorizationUrl: 'https://login.interno.example/oauth/authorize', tokenUrl: 'https://login.interno.example/oauth/token' });
  assert.equal(oauthConfigFor(shippedConnector(settings, 'email')).tokenUrl.toString(), 'https://login.interno.example/oauth/token');
});

test('recusa endpoints fora do allowlist do conector ou sem HTTPS', () => {
  assert.throws(() => oauthConfigFor({ allowedHosts: ['service.example.test'], oauth: { pkce: true, authorizationUrl: 'http://service.example.test/a', tokenUrl: 'https://service.example.test/t' } }), /requires HTTPS/);
  assert.throws(() => oauthConfigFor({ allowedHosts: ['service.example.test'], oauth: { pkce: true, authorizationUrl: 'https://atacante.example.test/a', tokenUrl: 'https://service.example.test/t' } }), /not allowed for this connector/);
  assert.throws(() => oauthConfigFor({ allowedHosts: ['service.example.test'], oauth: { pkce: true, authorizationUrl: 'https://service.example.test/a', tokenUrl: 'https://atacante.example.test/t' } }), /not allowed for this connector/);
});

const refusedExchange = async (body, status = 400) => {
  const keychain = memoryKeychain();
  let opened;
  const service = createOAuthService({
    keychain, getConnector: () => connector,
    openExternal: (url) => { opened = new URL(url); },
    fetch: async () => ({ ok: false, status, json: async () => body() }),
  });
  // A recusa é capturada já na criação da promessa: esperar para tratar depois deixa a rejeição solta.
  const started = service.authorize('fixture', { clientId: 'client-123' }).then(() => null, (reason) => reason);
  await new Promise((resolve) => setImmediate(resolve));
  const redirectUri = new URL(opened.searchParams.get('redirect_uri'));
  await fetch(`${redirectUri.origin}/oauth/callback?state=${encodeURIComponent(opened.searchParams.get('state'))}&code=auth-code-1`);
  const error = await started;
  return { message: error?.message ?? '', keychain };
};

test('mostra o código de recusa do servidor de autorização, sem a descrição nem o corpo', async () => {
  const { message, keychain } = await refusedExchange(() => ({
    error: 'invalid_client',
    error_description: 'Missing required parameter: client_secret abcdefghijklmnopqrstuvwxyz0123456789',
  }));

  assert.match(message, /invalid_client/);
  assert.match(message, /HTTP 400/);
  assert.doesNotMatch(message, /client_secret|abcdefghijklmnopqrstuvwxyz/);
  assert.equal(keychain.store.size, 0);
});

test('uma recusa sem código utilizável mostra só o status', async () => {
  const semCodigo = await refusedExchange(() => ({ error: 'Código Inválido!!', error_description: 'x' }), 401);
  assert.match(semCodigo.message, /HTTP 401/);
  assert.doesNotMatch(semCodigo.message, /Inválido/);

  const semCorpo = await refusedExchange(() => { throw new Error('resposta não é JSON'); }, 502);
  assert.match(semCorpo.message, /HTTP 502/);
  assert.doesNotMatch(semCorpo.message, /não é JSON/);
});

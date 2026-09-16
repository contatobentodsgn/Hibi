const crypto = require('node:crypto');
const http = require('node:http');

const MAX_AUTHORIZATION_MS = 5 * 60 * 1000;
const MAX_TOKEN_BYTES = 8_192;
const CALLBACK_PATH = '/oauth/callback';

const base64url = (bytes) => bytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const boundedSecret = (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_TOKEN_BYTES;
const isClientId = (value) => typeof value === 'string' && /^[\w.:-]{1,200}$/.test(value);
const RESERVED_AUTHORIZATION_PARAMETERS = new Set(['response_type', 'client_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method', 'scope']);

const accessAccount = (connectorId) => `integration:${connectorId}`;
const refreshAccount = (connectorId) => `integration:${connectorId}:refresh`;
// Alguns serviços exigem uma credencial de cliente na troca de token mesmo com PKCE — o Google recusa
// com `invalid_request: client_secret is missing`. Ela é configuração do app, e não do grant da pessoa,
// mas continua sendo segredo: fica no Keychain, nunca no arquivo de configurações, e nunca volta ao renderer.
const clientSecretAccount = (connectorId) => `integration:${connectorId}:client-secret`;

function oauthConfigFor(connector) {
  const config = connector?.oauth;
  if (!config || config.pkce !== true) throw new Error('This integration does not support the PKCE authorization flow.');
  const allowed = new Set([...(connector.allowedHosts ?? []), ...(config.allowedHosts ?? [])].map((host) => String(host).toLowerCase()));
  const endpoint = (raw, label) => {
    let url;
    try { url = new URL(raw); } catch { throw new Error(`Integration ${label} URL is invalid.`); }
    if (url.protocol !== 'https:') throw new Error(`Integration ${label} URL requires HTTPS.`);
    if (!allowed.has(url.hostname.toLowerCase())) throw new Error(`Integration ${label} URL is not allowed for this connector.`);
    return url;
  };
  const authorizationParams = {};
  for (const [key, value] of Object.entries(config.authorizationParams ?? {})) {
    if (!/^[a-z][a-z0-9_]{0,79}$/i.test(key) || RESERVED_AUTHORIZATION_PARAMETERS.has(key) || typeof value !== 'string' || !value || value.length > 240) throw new Error('Integration authorization parameters are invalid.');
    authorizationParams[key] = value;
  }
  return { authorizationUrl: endpoint(config.authorizationUrl, 'authorization'), tokenUrl: endpoint(config.tokenUrl, 'token'), scopes: Array.isArray(config.scopes) ? config.scopes.filter((scope) => typeof scope === 'string' && scope) : [], authorizationParams };
}

// O corpo da resposta de token nunca é registrado nem devolvido ao renderer:
// somente o resumo sanitizado abaixo atravessa a ponte.
function readTokenResponse(body) {
  if (!body || typeof body !== 'object') throw new Error('The authorization server returned an invalid token response.');
  if (!boundedSecret(body.access_token)) throw new Error('The authorization server did not return an access token.');
  const refreshToken = boundedSecret(body.refresh_token) ? body.refresh_token : undefined;
  const expiresIn = Number.isFinite(body.expires_in) && body.expires_in > 0 ? Math.floor(body.expires_in) : undefined;
  return { accessToken: body.access_token, refreshToken, expiresIn };
}

function createLoopbackCallbackServer({ onCallback }) {
  let server;
  const reply = (response, status, message) => {
    const body = Buffer.from(`<!doctype html><meta charset="utf-8"><title>Hibi</title><p>${message}</p>`, 'utf8');
    response.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'content-length': body.length, 'cache-control': 'no-store' });
    response.end(body);
  };
  return {
    async start() {
      if (server) return `http://127.0.0.1:${server.address().port}${CALLBACK_PATH}`;
      server = http.createServer((request, response) => {
        let url;
        try { url = new URL(request.url, 'http://127.0.0.1'); } catch { return reply(response, 400, 'Invalid request.'); }
        if (request.method !== 'GET' || url.pathname !== CALLBACK_PATH) return reply(response, 404, 'Not found.');
        try {
          onCallback({ state: url.searchParams.get('state'), code: url.searchParams.get('code'), error: url.searchParams.get('error') });
          reply(response, 200, 'Authorization received. You can close this tab and return to Hibi.');
        } catch (error) {
          reply(response, 400, error instanceof Error ? error.message : 'Authorization was rejected.');
        }
      });
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      return `http://127.0.0.1:${server.address().port}${CALLBACK_PATH}`;
    },
    async stop() {
      if (!server) return;
      const active = server; server = undefined;
      await new Promise((resolve) => active.close(() => resolve()));
    },
    isRunning: () => Boolean(server),
  };
}

function createOAuthService({ keychain, getConnector, openExternal, fetch = globalThis.fetch, now = () => Date.now(), timeoutMs = MAX_AUTHORIZATION_MS } = {}) {
  if (!keychain || typeof keychain.set !== 'function' || typeof keychain.get !== 'function' || typeof keychain.has !== 'function' || typeof keychain.remove !== 'function') throw new Error('A Keychain implementation is required.');
  if (typeof getConnector !== 'function' || typeof openExternal !== 'function' || typeof fetch !== 'function') throw new Error('OAuth service dependencies are required.');

  // Um único state pendente por vez: o servidor de callback só existe enquanto
  // há uma autorização em andamento e o state é consumido na primeira chamada.
  let pending = null;
  const callbackServer = createLoopbackCallbackServer({
    onCallback: ({ state, code, error }) => {
      if (!pending || typeof state !== 'string' || state.length !== pending.state.length || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(pending.state))) throw new Error('Authorization state is invalid or already used.');
      const active = pending;
      pending = null;
      if (error) { active.reject(new Error('The authorization server rejected this authorization.')); return; }
      if (typeof code !== 'string' || !code || code.length > MAX_TOKEN_BYTES) { active.reject(new Error('The authorization server did not return a code.')); return; }
      active.resolve(code);
    },
  });

  // Um código de erro do OAuth diz o que fazer: `invalid_client` pede credencial de cliente, `invalid_grant`
  // pede autorizar de novo, `redirect_uri_mismatch` pede ajustar o registro. A mesma frase para toda recusa
  // não diz nada. Só o código curto e o status atravessam: descrição e corpo podem carregar parâmetros.
  const REFUSAL_CODE = /^[a-z][a-z_]{0,39}$/;
  const refusalFrom = async (response) => {
    const status = Number.isInteger(response?.status) ? `HTTP ${response.status}` : 'sem status';
    try {
      const body = await response.json();
      const code = typeof body?.error === 'string' && REFUSAL_CODE.test(body.error) ? body.error : null;
      return code ? `${code}, ${status}` : status;
    } catch {
      return status;
    }
  };

  const exchange = async ({ tokenUrl, params }) => {
    const response = await fetch(tokenUrl.toString(), {
      method: 'POST',
      redirect: 'error',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams(params).toString(),
    });
    if (!response?.ok) throw new Error(`The authorization server rejected the token request (${await refusalFrom(response)}).`);
    let body;
    try { body = await response.json(); } catch { throw new Error('The authorization server returned an invalid token response.'); }
    return readTokenResponse(body);
  };

  const clientCredential = async (connectorId) => {
    if (!await keychain.has(clientSecretAccount(connectorId))) return {};
    const secret = await keychain.get(clientSecretAccount(connectorId));
    return boundedSecret(secret) ? { client_secret: secret } : {};
  };

  const store = async (connectorId, tokens) => {
    await keychain.set(accessAccount(connectorId), tokens.accessToken);
    if (tokens.refreshToken) await keychain.set(refreshAccount(connectorId), tokens.refreshToken);
    return { connectorId, connected: true, hasRefreshToken: Boolean(tokens.refreshToken) || await keychain.has(refreshAccount(connectorId)), ...(tokens.expiresIn === undefined ? {} : { expiresAt: new Date(now() + tokens.expiresIn * 1_000).toISOString() }) };
  };

  const cancelPending = (reason) => {
    if (!pending) return;
    const active = pending;
    pending = null;
    clearTimeout(active.timer);
    active.reject(new Error(reason));
  };

  return {
    supports(connectorId) { try { oauthConfigFor(getConnector(connectorId)); return true; } catch { return false; } },

    async authorize(connectorId, { clientId } = {}) {
      const connector = getConnector(connectorId);
      const config = oauthConfigFor(connector);
      if (!isClientId(clientId)) throw new Error('A client identifier from the service is required.');
      cancelPending('A newer authorization replaced this one.');

      const verifier = base64url(crypto.randomBytes(32));
      const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
      const state = base64url(crypto.randomBytes(32));
      const redirectUri = await callbackServer.start();

      const authorization = new URL(config.authorizationUrl.toString());
      authorization.searchParams.set('response_type', 'code');
      authorization.searchParams.set('client_id', clientId);
      authorization.searchParams.set('redirect_uri', redirectUri);
      authorization.searchParams.set('state', state);
      authorization.searchParams.set('code_challenge', challenge);
      authorization.searchParams.set('code_challenge_method', 'S256');
      if (config.scopes.length > 0) authorization.searchParams.set('scope', config.scopes.join(' '));
      for (const [key, value] of Object.entries(config.authorizationParams)) authorization.searchParams.set(key, value);

      let timer;
      const code = await new Promise((resolve, reject) => {
        timer = setTimeout(() => cancelPending('The authorization timed out.'), timeoutMs);
        pending = { state, resolve, reject, timer };
        Promise.resolve(openExternal(authorization.toString())).catch(() => cancelPending('The system browser could not be opened.'));
      }).finally(async () => { clearTimeout(timer); pending = null; await callbackServer.stop(); });

      const tokens = await exchange({ tokenUrl: config.tokenUrl, params: { grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier, ...await clientCredential(connectorId) } });
      return store(connectorId, tokens);
    },

    async refresh(connectorId, { clientId } = {}) {
      const config = oauthConfigFor(getConnector(connectorId));
      if (!isClientId(clientId)) throw new Error('A client identifier from the service is required.');
      if (!await keychain.has(refreshAccount(connectorId))) throw new Error('No refresh token is stored for this integration.');
      const refreshToken = await keychain.get(refreshAccount(connectorId));
      if (!boundedSecret(refreshToken)) throw new Error('No refresh token is stored for this integration.');
      const tokens = await exchange({ tokenUrl: config.tokenUrl, params: { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId, ...await clientCredential(connectorId) } });
      return store(connectorId, tokens);
    },

    // A credencial de cliente é configuração do app: guardar, apagar e saber se existe, sem nunca devolvê-la.
    async saveClientSecret(connectorId, secret) {
      getConnector(connectorId);
      if (!boundedSecret(secret)) throw new Error('A client credential from the service is required.');
      await keychain.set(clientSecretAccount(connectorId), secret.trim());
      return { connectorId, hasClientSecret: true };
    },

    async clearClientSecret(connectorId) {
      getConnector(connectorId);
      await keychain.remove(clientSecretAccount(connectorId));
      return { connectorId, hasClientSecret: false };
    },

    async hasClientSecret(connectorId) {
      getConnector(connectorId);
      return keychain.has(clientSecretAccount(connectorId));
    },

    // Revogar derruba o acesso da pessoa, e não a configuração do app: a credencial de cliente fica.
    async revoke(connectorId) {
      getConnector(connectorId);
      await keychain.remove(accessAccount(connectorId));
      await keychain.remove(refreshAccount(connectorId));
      return { connectorId, connected: false, hasRefreshToken: false };
    },

    cancel() { cancelPending('The authorization was cancelled.'); return callbackServer.stop(); },
    isAwaitingCallback: () => Boolean(pending) && callbackServer.isRunning(),
  };
}

module.exports = { CALLBACK_PATH, createOAuthService, createLoopbackCallbackServer, oauthConfigFor };

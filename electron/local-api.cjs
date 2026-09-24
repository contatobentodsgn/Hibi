const crypto = require('node:crypto');
const http = require('node:http');

const TOKEN_ACCOUNT = 'local-api-token';
const MAX_BODY_BYTES = 64 * 1024;
const MAX_REQUESTS_PER_MINUTE = 60;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1']);
const safeJson = (value) => JSON.stringify(value);

function createLocalApiTokenStore({ keychain, account = TOKEN_ACCOUNT } = {}) {
  if (!keychain || typeof keychain.get !== 'function' || typeof keychain.set !== 'function' || typeof keychain.remove !== 'function') throw new Error('A Keychain implementation is required.');
  return {
    async getOrCreate() {
      try { const existing = await keychain.get(account); if (typeof existing === 'string' && existing.length >= 32) return existing; } catch { /* create a new local token */ }
      const token = crypto.randomBytes(32).toString('base64url');
      await keychain.set(account, token);
      return token;
    },
    async revoke() { return keychain.remove(account); },
  };
}

function openApiDocument(origin = 'http://127.0.0.1') {
  return { openapi: '3.1.0', info: { title: 'Pixano Local API', version: '1.0.0' }, servers: [{ url: origin }], paths: { '/v1/tasks': { get: { summary: 'List local tasks' }, post: { summary: 'Prepare task creation confirmation' } }, '/v1/reminders': { get: { summary: 'List local reminders' } }, '/v1/schedule': { get: { summary: 'List local schedule blocks' } } } };
}

const timingSafeTokenMatch = (provided, expected) => {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(provided); const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const send = (response, status, value) => { const body = safeJson(value); response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' }); response.end(body); };
const readBody = (request) => new Promise((resolve, reject) => {
  let total = 0; const parts = [];
  request.on('data', (chunk) => { total += chunk.length; if (total > MAX_BODY_BYTES) { request.destroy(); reject(new Error('Request body exceeds the size limit.')); } else parts.push(chunk); });
  request.on('end', () => resolve(Buffer.concat(parts)));
  request.on('error', reject);
});

function createLocalApi({ tokenStore, workspace, prepareWrite = async () => ({ requiresConfirmation: true }) } = {}) {
  if (!tokenStore || typeof tokenStore.getOrCreate !== 'function' || typeof workspace !== 'function') throw new Error('Local API dependencies are required.');
  let server;
  const counters = new Map();
  const withinRateLimit = (address) => { const current = Date.now(); const entry = counters.get(address); if (!entry || current - entry.startedAt >= 60_000) { counters.set(address, { startedAt: current, count: 1 }); return true; } entry.count += 1; return entry.count <= MAX_REQUESTS_PER_MINUTE; };
  return {
    async start({ host = '127.0.0.1', port = 0 } = {}) {
      if (!LOOPBACK_HOSTS.has(host)) throw new Error('Local API can bind only to a loopback host.');
      if (server) throw new Error('Local API is already running.');
      const token = await tokenStore.getOrCreate();
      server = http.createServer(async (request, response) => {
        try {
          if (!withinRateLimit(request.socket.remoteAddress ?? 'unknown')) return send(response, 429, { error: 'rate_limited' });
          const authorization = request.headers.authorization;
          const bearer = typeof authorization === 'string' && authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
          if (!timingSafeTokenMatch(bearer, token)) return send(response, 401, { error: 'unauthorized' });
          const origin = `http://${host}:${server.address().port}`;
          if (request.method === 'GET' && request.url === '/openapi.json') return send(response, 200, openApiDocument(origin));
          const snapshot = workspace();
          if (request.method === 'GET' && request.url === '/v1/tasks') return send(response, 200, { tasks: Array.isArray(snapshot?.tasks) ? snapshot.tasks : [] });
          if (request.method === 'GET' && request.url === '/v1/reminders') return send(response, 200, { reminders: Array.isArray(snapshot?.reminders) ? snapshot.reminders : [] });
          if (request.method === 'GET' && request.url === '/v1/schedule') return send(response, 200, { blocks: Array.isArray(snapshot?.blocks) ? snapshot.blocks : [] });
          if (request.method === 'POST' && request.url === '/v1/tasks') {
            const bytes = await readBody(request); let payload;
            try { payload = JSON.parse(bytes.toString('utf8')); } catch { return send(response, 400, { error: 'invalid_json' }); }
            if (!payload || typeof payload.title !== 'string' || !payload.title.trim() || payload.title.length > 240) return send(response, 400, { error: 'invalid_task' });
            return send(response, 202, await prepareWrite({ kind: 'task.create', payload: { title: payload.title.trim() } }));
          }
          return send(response, 404, { error: 'not_found' });
        } catch (error) { return send(response, 400, { error: error instanceof Error && error.message.includes('size limit') ? 'body_too_large' : 'request_failed' }); }
      });
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => { server.off('error', reject); resolve(); }); });
      const address = server.address();
      return { origin: `http://${host}:${address.port}`, token };
    },
    async stop() { if (!server) return; const current = server; server = undefined; await new Promise((resolve, reject) => current.close((error) => error ? reject(error) : resolve())); },
    isRunning() { return Boolean(server); },
  };
}

module.exports = { TOKEN_ACCOUNT, createLocalApi, createLocalApiTokenStore, openApiDocument };

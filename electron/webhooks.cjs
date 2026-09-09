const crypto = require('node:crypto');
const http = require('node:http');

const MAX_BODY_BYTES = 64 * 1024;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_NONCES = 1_000;
const isNonce = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const isEvent = (value) => typeof value === 'string' && /^[a-z0-9._-]{1,120}$/.test(value);

function createWebhookVerifier({ secret, now = () => Date.now() } = {}) {
  if (typeof secret !== 'string' || !secret || secret.length > 8_192) throw new Error('A webhook signing secret is required.');
  const nonces = new Map();
  const prune = (current) => {
    for (const [nonce, createdAt] of nonces) if (current - createdAt > MAX_CLOCK_SKEW_MS) nonces.delete(nonce);
    while (nonces.size > MAX_NONCES) nonces.delete(nonces.keys().next().value);
  };
  return {
    verify({ signature, timestamp, nonce, body } = {}) {
      const current = now();
      const timestampMs = typeof timestamp === 'string' && /^\d{1,16}$/.test(timestamp) ? Number(timestamp) : NaN;
      if (!Number.isFinite(timestampMs) || Math.abs(current - timestampMs) > MAX_CLOCK_SKEW_MS) throw new Error('Webhook timestamp is invalid or expired.');
      if (!isNonce(nonce)) throw new Error('Webhook nonce is invalid.');
      const bytes = Buffer.isBuffer(body) ? body : typeof body === 'string' ? Buffer.from(body) : null;
      if (!bytes || bytes.length > MAX_BODY_BYTES) throw new Error('Webhook body exceeds the size limit.');
      if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) throw new Error('Webhook signature is invalid.');
      const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${nonce}.`).update(bytes).digest();
      const received = Buffer.from(signature, 'hex');
      if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) throw new Error('Webhook signature is invalid.');
      prune(current);
      if (nonces.has(nonce)) throw new Error('Webhook replay was rejected.');
      let parsed;
      try { parsed = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('Webhook JSON is invalid.'); }
      if (!parsed || typeof parsed !== 'object' || !isEvent(parsed.event)) throw new Error('Webhook event is invalid.');
      nonces.set(nonce, current);
      return { event: parsed.event };
    },
  };
}

function createLoopbackWebhookReceiver({ verifier, prepare } = {}) {
  if (!verifier || typeof verifier.verify !== 'function' || typeof prepare !== 'function') throw new Error('A verifier and confirmation preparer are required.');
  let server;
  const reply = (response, status, payload) => {
    const body = Buffer.from(JSON.stringify(payload));
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': body.length, 'cache-control': 'no-store' });
    response.end(body);
  };
  const handler = (request, response) => {
    if (request.method !== 'POST' || request.url !== '/webhook') return reply(response, 404, { error: 'Not found.' });
    const parts = []; let total = 0; let finished = false;
    const fail = (status, message) => { if (!finished) { finished = true; reply(response, status, { error: message }); } };
    request.on('data', (chunk) => { total += chunk.length; if (total > MAX_BODY_BYTES) { request.destroy(); fail(413, 'Webhook body exceeds the size limit.'); } else parts.push(chunk); });
    request.on('error', () => fail(400, 'Webhook request failed.'));
    request.on('end', async () => {
      if (finished) return;
      try {
        const event = verifier.verify({ signature: request.headers['x-hibi-signature'], timestamp: request.headers['x-hibi-timestamp'], nonce: request.headers['x-hibi-nonce'], body: Buffer.concat(parts) });
        const intent = await prepare(event);
        if (!intent || typeof intent.confirmationId !== 'string' || intent.requiresConfirmation !== true) throw new Error('Webhook action requires confirmation.');
        finished = true; reply(response, 202, { confirmationId: intent.confirmationId, requiresConfirmation: true });
      } catch (error) { fail(401, error instanceof Error ? error.message : 'Webhook rejected.'); }
    });
  };
  return {
    async start() {
      if (server) { const address = server.address(); return { origin: `http://127.0.0.1:${address.port}` }; }
      server = http.createServer(handler);
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      const address = server.address();
      return { origin: `http://127.0.0.1:${address.port}` };
    },
    async stop() { if (!server) return; const active = server; server = undefined; await new Promise((resolve, reject) => active.close((error) => error ? reject(error) : resolve())); },
    isRunning: () => Boolean(server),
  };
}

module.exports = { createWebhookVerifier, createLoopbackWebhookReceiver };

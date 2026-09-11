const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createLoopbackWebhookReceiver, createWebhookService, createWebhookVerifier } = require('./webhooks.cjs');

const signed = (secret, timestamp, nonce, body) => crypto.createHmac('sha256', secret).update(`${timestamp}.${nonce}.`).update(body).digest('hex');

test('rejects invalid or replayed inbound webhook signatures before any event is accepted', () => {
  const now = 1_700_000_000_000;
  const body = Buffer.from('{"event":"task.updated"}');
  const verifier = createWebhookVerifier({ secret: 'webhook-secret', now: () => now });
  const timestamp = String(now);
  const nonce = 'nonce-1';

  assert.deepEqual(verifier.verify({ signature: signed('webhook-secret', timestamp, nonce, body), timestamp, nonce, body }), { event: 'task.updated' });
  assert.throws(() => verifier.verify({ signature: signed('webhook-secret', timestamp, nonce, body), timestamp, nonce, body }), /replay/i);
  assert.throws(() => verifier.verify({ signature: 'wrong', timestamp, nonce: 'nonce-2', body }), /signature/i);
  assert.throws(() => verifier.verify({ signature: signed('webhook-secret', String(now - 600_000), 'nonce-3', body), timestamp: String(now - 600_000), nonce: 'nonce-3', body }), /timestamp/i);
});

// O receptor autentica e aceita o evento; ele não propõe nada ao workspace, então
// a resposta não pode prometer uma confirmação que ninguém vai apresentar.
test('accepts a verified loopback webhook as a received event and proposes nothing', async () => {
  const now = 1_700_000_000_000;
  const body = Buffer.from('{"event":"task.updated"}');
  const receiver = createLoopbackWebhookReceiver({ verifier: createWebhookVerifier({ secret: 'webhook-secret', now: () => now }) });
  const { origin } = await receiver.start();
  const post = (nonce, signature, payload = body) => fetch(`${origin}/webhook`, { method: 'POST', headers: {
    'content-type': 'application/json',
    'x-hibi-timestamp': String(now),
    'x-hibi-nonce': nonce,
    'x-hibi-signature': signature,
  }, body: payload });
  try {
    const accepted = await post('nonce-loopback', signed('webhook-secret', String(now), 'nonce-loopback', body));
    assert.equal(accepted.status, 200);
    const payload = await accepted.json();
    assert.deepEqual(payload, { accepted: true, event: 'task.updated' });
    assert.equal(Object.hasOwn(payload, 'confirmationId'), false);
    assert.equal(Object.hasOwn(payload, 'requiresConfirmation'), false);

    // A autenticação continua sendo a substância do recurso: sem `prepare` no caminho,
    // assinatura inválida e repetição de nonce seguem recusadas no nível HTTP.
    const forged = await post('nonce-forged', 'f'.repeat(64));
    assert.equal(forged.status, 401);
    const replayed = await post('nonce-loopback', signed('webhook-secret', String(now), 'nonce-loopback', body));
    assert.equal(replayed.status, 401);
  } finally { await receiver.stop(); }
});

test('stores a webhook secret in Keychain and reports only its loopback state', async () => {
  const values = new Map();
  const service = createWebhookService({ keychain: { get: async (key) => values.get(key), set: async (key, value) => values.set(key, value), has: async (key) => values.has(key), remove: async (key) => values.delete(key) } });
  await service.configure('secret-for-test');
  const started = await service.start();
  try { assert.deepEqual(await service.status(), { running: true, hasSecret: true, origin: started.origin }); }
  finally { await service.stop(); }
});

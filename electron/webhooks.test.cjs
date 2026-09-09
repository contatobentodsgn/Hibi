const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createWebhookVerifier } = require('./webhooks.cjs');

const signed = (secret, timestamp, nonce, body) => crypto.createHmac('sha256', secret).update(`${timestamp}.${nonce}.`).update(body).digest('hex');

test('rejects invalid or replayed inbound webhook signatures before any action can be prepared', () => {
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

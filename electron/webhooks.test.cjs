const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createLoopbackWebhookReceiver, createWebhookVerifier } = require('./webhooks.cjs');

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

test('accepts a verified loopback webhook only as a confirmation intent', async () => {
  const now = 1_700_000_000_000;
  const body = Buffer.from('{"event":"task.updated"}');
  const receiver = createLoopbackWebhookReceiver({
    verifier: createWebhookVerifier({ secret: 'webhook-secret', now: () => now }),
    prepare: async (event) => ({ confirmationId: `confirm-${event.event}`, requiresConfirmation: true }),
  });
  const { origin } = await receiver.start();
  try {
    const timestamp = String(now);
    const response = await fetch(`${origin}/webhook`, { method: 'POST', headers: {
      'content-type': 'application/json',
      'x-hibi-timestamp': timestamp,
      'x-hibi-nonce': 'nonce-loopback',
      'x-hibi-signature': signed('webhook-secret', timestamp, 'nonce-loopback', body),
    }, body });
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { confirmationId: 'confirm-task.updated', requiresConfirmation: true });
  } finally { await receiver.stop(); }
});

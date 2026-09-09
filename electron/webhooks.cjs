const crypto = require('node:crypto');

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

module.exports = { createWebhookVerifier };

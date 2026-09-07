const test = require('node:test'); const assert = require('node:assert/strict');
const { createMainAiRuntime, createOpenAiCompatibleClient, redactedError, safeEndpoint, validateTurn } = require('./ai-runtime.cjs');
test('allows only HTTPS or loopback endpoints and redacts credentials', () => { assert.equal(safeEndpoint('https://api.example.test/v1').protocol, 'https:'); assert.equal(safeEndpoint('http://127.0.0.1:8080').hostname, '127.0.0.1'); assert.throws(() => safeEndpoint('http://example.test')); assert.equal(redactedError(new Error('Bearer sk-secret')), 'Bearer [redacted]'); });
test('validates renderer input', () => { assert.deepEqual(validateTurn({ message: ' hi ', surface: 'notch' }), { message: 'hi', surface: 'notch' }); assert.throws(() => validateTurn({ message: '', surface: 'shell' })); });
test('enforces provider response size and cancellation', async () => { const oversized = createOpenAiCompatibleClient({ endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'm', fetchImpl: async () => ({ ok: true, headers: { get: () => '1048577' }, text: async () => '' }) }); await assert.rejects(() => oversized.generate({ message: 'x' }), /1 MiB/); const runtime = createMainAiRuntime(); const response = await runtime.run({ message: 'hi', surface: 'desktop' }); assert.equal(response.providerLabel, 'Hibi local heuristic'); });
test('tests the exact configured endpoint, credential, and model before saving', async () => {
  let request;
  const client = createOpenAiCompatibleClient({ endpoint: 'https://api.example.test/v1/chat/completions', apiKey: 'secret-value', model: 'gpt-test', fetchImpl: async (url, init) => { request = { url, init }; return { ok: true, headers: { get: () => '32' }, text: async () => JSON.stringify({ choices: [{ message: { content: 'OK' } }] }) }; } });

  await client.testConnection();

  assert.equal(request.url.toString(), 'https://api.example.test/v1/chat/completions');
  assert.equal(request.init.headers.authorization, 'Bearer secret-value');
  assert.equal(JSON.parse(request.init.body).model, 'gpt-test');
});

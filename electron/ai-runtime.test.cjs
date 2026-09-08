const test = require('node:test'); const assert = require('node:assert/strict');
const { createMainAiRuntime, createOpenAiCompatibleClient, redactedError, safeEndpoint, validateTurn } = require('./ai-runtime.cjs');

const encoder = new TextEncoder();
function jsonResponse(value, { status = 200, headers = {} } = {}) {
  return { ok: status >= 200 && status < 300, status, headers: { get: (name) => headers[name.toLowerCase()] ?? null }, text: async () => JSON.stringify(value) };
}
function streamResponse(chunks, { status = 200, headers = {} } = {}) {
  let index = 0;
  let cancelled = false;
  return {
    ok: status >= 200 && status < 300, status,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    body: { getReader: () => ({
      read: async () => index < chunks.length ? { done: false, value: encoder.encode(chunks[index++]) } : { done: true },
      cancel: async () => { cancelled = true; },
    }) },
    wasCancelled: () => cancelled,
  };
}
function providerJson(content = 'complete') {
  return { model: 'provider-model', choices: [{ message: { content } }] };
}
test('allows only HTTPS or loopback endpoints and redacts credentials', () => { assert.equal(safeEndpoint('https://api.example.test/v1').protocol, 'https:'); assert.equal(safeEndpoint('http://127.0.0.1:8080').hostname, '127.0.0.1'); assert.throws(() => safeEndpoint('http://example.test')); assert.equal(redactedError(new Error('Bearer sk-secret')), 'Bearer [redacted]'); });
test('validates renderer input', () => { assert.deepEqual(validateTurn({ message: ' hi ', surface: 'notch' }), { message: 'hi', surface: 'notch' }); assert.throws(() => validateTurn({ message: '', surface: 'shell' })); });
test('enforces provider response size and cancellation', async () => { const oversized = createOpenAiCompatibleClient({ endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'm', fetchImpl: async () => ({ ok: true, headers: { get: () => '1048577' }, text: async () => '' }) }); await assert.rejects(() => oversized.generate({ message: 'x' }), /1 MiB/); const runtime = createMainAiRuntime(); const response = await runtime.run({ message: 'hi', surface: 'desktop' }); assert.equal(response.providerLabel, 'Hibi local heuristic'); });
test('bounds streamed SSE bodies before parsing their events', async () => {
  const client = createOpenAiCompatibleClient({ endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'm', fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => null }, body: { getReader: () => ({ read: async () => ({ done: false, value: Buffer.alloc(1024 * 1024 + 1) }), cancel: async () => {} }) } }) });

  await assert.rejects(() => client.generate({ message: 'x', surface: 'desktop' }), /1 MiB/);
});
test('tests the exact configured endpoint, credential, and model before saving', async () => {
  let request;
  const client = createOpenAiCompatibleClient({ endpoint: 'https://api.example.test/v1/chat/completions', apiKey: 'secret-value', model: 'gpt-test', fetchImpl: async (url, init) => { request = { url, init }; return { ok: true, headers: { get: () => '32' }, text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: 'Ready', toolCalls: [], notchPresentation: null }) } }] }) }; } });

  await client.testConnection();

  assert.equal(request.url.toString(), 'https://api.example.test/v1/chat/completions');
  assert.equal(request.init.headers.authorization, 'Bearer secret-value');
  assert.equal(JSON.parse(request.init.body).model, 'gpt-test');
});

test('uses the model reported by the provider and never follows redirects', async () => {
  let request;
  const client = createOpenAiCompatibleClient({ endpoint: 'https://api.example.test/v1/chat/completions', apiKey: 'secret-value', model: 'requested-model', fetchImpl: async (_url, init) => { request = init; return { ok: true, headers: { get: () => '32' }, text: async () => JSON.stringify({ model: 'reported-model', choices: [{ message: { content: JSON.stringify({ reply: 'Ready', toolCalls: [], notchPresentation: null }) } }] }) }; } });

  const result = await client.generate({ message: 'hello', surface: 'desktop' });

  assert.equal(result.model, 'reported-model');
  assert.equal(request.redirect, 'error');
});

test('rejects a connection test when the provider response is not the promised JSON contract', async () => {
  const client = createOpenAiCompatibleClient({ endpoint: 'https://api.example.test/v1/chat/completions', apiKey: 'secret-value', model: 'requested-model', fetchImpl: async () => ({ ok: true, headers: { get: () => '2' }, text: async () => JSON.stringify({ choices: [{ message: { content: 'OK' } }] }) }) });

  await assert.rejects(() => client.testConnection(), /invalid JSON contract/);
});

test('parses a bounded OpenAI-compatible SSE body into request-scoped delta, usage, and completed events', async () => {
  const events = [];
  const response = streamResponse([
    'data: {"choices":[{"delta":{"content":"hel"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"lo"}}],"usage":{"prompt_tokens":3,"completion_tokens":2}}\n\n',
    'data: [DONE]\n\n',
  ]);
  const client = createOpenAiCompatibleClient({ endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'm', onEvent: (event) => events.push(event), fetchImpl: async () => response });

  const result = await client.generate({ message: 'x', surface: 'desktop' });

  assert.equal(result.content, 'hello');
  assert.deepEqual(events, [
    { type: 'delta', delta: 'hel' },
    { type: 'delta', delta: 'lo' },
    { type: 'usage', usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 } },
    { type: 'completed' },
  ]);
});

test('uses the existing JSON completion response when streaming is unavailable', async () => {
  const requests = [];
  const client = createOpenAiCompatibleClient({ endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'm', fetchImpl: async (_url, init) => { requests.push(JSON.parse(init.body)); return jsonResponse(providerJson('fallback')); } });

  const result = await client.generate({ message: 'x', surface: 'desktop' });

  assert.equal(result.content, 'fallback');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].stream, true);
});

test('falls back to a non-streaming completion when the stream fails before valid events', async () => {
  let calls = 0;
  const client = createOpenAiCompatibleClient({ endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'm', fetchImpl: async (_url, init) => {
    calls += 1;
    if (calls === 1) return { ok: true, status: 200, headers: { get: () => null }, body: { getReader: () => ({ read: async () => { throw new TypeError('socket secret-value failed'); }, cancel: async () => {} }) } };
    assert.equal(JSON.parse(init.body).stream, undefined);
    return jsonResponse(providerJson('fallback'));
  } });

  const result = await client.generate({ message: 'x', surface: 'desktop' });

  assert.equal(result.content, 'fallback');
  assert.equal(calls, 2);
});

test('classifies invalid credentials without retrying or exposing provider data', async () => {
  for (const status of [401, 403]) {
    const events = []; let calls = 0;
    const client = createOpenAiCompatibleClient({ endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'm', onEvent: (event) => events.push(event), fetchImpl: async () => { calls += 1; return jsonResponse({ error: { message: 'sk-secret raw provider detail' } }, { status }); } });

    await assert.rejects(() => client.generate({ message: 'x', surface: 'desktop' }), /invalid_credentials/);

    assert.equal(calls, 1);
    assert.deepEqual(events, [{ type: 'failed', failure: { code: 'invalid_credentials', retryable: false } }]);
    assert.doesNotMatch(JSON.stringify(events), /secret|provider detail/i);
  }
});

test('retries a rate-limited request once using its bounded Retry-After delay', async () => {
  const events = []; const delays = []; let calls = 0;
  const client = createOpenAiCompatibleClient({ endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'm', onEvent: (event) => events.push(event), sleep: async (delay) => { delays.push(delay); }, fetchImpl: async () => { calls += 1; return calls === 1 ? jsonResponse({}, { status: 429, headers: { 'retry-after': '120' } }) : jsonResponse(providerJson('ok')); } });

  const result = await client.generate({ message: 'x', surface: 'desktop' });

  assert.equal(result.content, 'ok');
  assert.equal(calls, 2);
  assert.deepEqual(delays, [60_000]);
  assert.deepEqual(events, [{ type: 'retrying', attempt: 1, delayMs: 60_000, failure: { code: 'rate_limited', retryable: true, retryAfterMs: 60_000 } }]);
});

test('retries unavailable errors at most twice with injected capped backoff', async () => {
  const events = []; const delays = []; let calls = 0;
  const client = createOpenAiCompatibleClient({ endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'm', onEvent: (event) => events.push(event), sleep: async (delay) => { delays.push(delay); }, fetchImpl: async () => { calls += 1; if (calls === 1) throw Object.assign(new TypeError('network failed'), { code: 'ENOTFOUND' }); if (calls === 2) return jsonResponse({}, { status: 503 }); return jsonResponse(providerJson('ok')); } });

  const result = await client.generate({ message: 'x', surface: 'desktop' });

  assert.equal(result.content, 'ok');
  assert.equal(calls, 3);
  assert.deepEqual(delays, [1_000, 2_000]);
  assert.deepEqual(events.map((event) => event.type), ['retrying', 'retrying']);
  assert.deepEqual(events[0].failure, { code: 'unavailable', retryable: true });
});

test('classifies request timeouts as unavailable and retries with injected delays', async () => {
  const events = []; const delays = []; let calls = 0;
  const client = createOpenAiCompatibleClient({ endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'm', timeoutMs: 1, onEvent: (event) => events.push(event), sleep: async (delay) => { delays.push(delay); }, fetchImpl: async (_url, init) => {
    calls += 1;
    await new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('fetch aborted', 'AbortError')), { once: true }));
  } });

  await assert.rejects(() => client.generate({ message: 'x', surface: 'desktop' }), /unavailable/);

  assert.equal(calls, 3);
  assert.deepEqual(delays, [1_000, 2_000]);
  assert.deepEqual(events.map((event) => event.type), ['retrying', 'retrying', 'failed']);
  assert.deepEqual(events.at(-1).failure, { code: 'unavailable', retryable: true });
});

test('cancels the stream reader and emits only a safe cancellation without retrying or falling back', async () => {
  const events = []; let calls = 0; let rejectRead;
  const response = { ok: true, status: 200, headers: { get: () => null }, body: { getReader: () => ({ read: () => new Promise((_resolve, reject) => { rejectRead = reject; }), cancel: async () => { rejectRead(new DOMException('cancelled', 'AbortError')); } }) } };
  const client = createOpenAiCompatibleClient({ endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'm', onEvent: (event) => events.push(event), sleep: async () => assert.fail('must not sleep after cancellation'), fetchImpl: async () => { calls += 1; return response; } });
  const controller = new AbortController();
  const pending = client.generate({ message: 'x', surface: 'desktop' }, controller.signal);
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();

  await assert.rejects(() => pending, /cancelled/);

  assert.equal(calls, 1);
  assert.deepEqual(events, [{ type: 'failed', failure: { code: 'cancelled', retryable: false } }]);
});

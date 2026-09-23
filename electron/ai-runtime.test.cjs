const test = require('node:test'); const assert = require('node:assert/strict'); const { EventEmitter } = require('node:events');
const { createAiRequestCoordinator, createMainAiRuntime, createOpenAiCompatibleClient, redactedError, replaceAiRequestCoordinator, retryDelayFor, safeEndpoint, validateTurn } = require('./ai-runtime.cjs');

const encoder = new TextEncoder();
function noTimeout() {
  const controller = new AbortController();
  return { signal: controller.signal, dispose: () => {} };
}
function createTestClient(options) { return createOpenAiCompatibleClient({ timeoutFactory: noTimeout, random: () => 1, ...options }); }
async function flushMicrotasks() { for (let index = 0; index < 4; index += 1) await Promise.resolve(); }
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
function assertBoundedDeltas(events, content) {
  const deltas = events.filter((event) => event.type === 'delta');
  assert.deepEqual(deltas.map((event) => event.delta), [content.slice(0, 8000), content.slice(8000)]);
  assert.equal(deltas.every((event) => event.delta.length <= 8000), true);
}
test('allows only HTTPS or loopback endpoints and redacts credentials', () => { assert.equal(safeEndpoint('https://api.example.test/v1').protocol, 'https:'); assert.equal(safeEndpoint('http://127.0.0.1:8080').hostname, '127.0.0.1'); assert.throws(() => safeEndpoint('http://example.test')); assert.equal(redactedError(new Error('Bearer sk-secret')), 'Bearer [redacted]'); });
test('validates renderer input', () => { assert.deepEqual(validateTurn({ message: ' hi ', surface: 'notch' }), { message: 'hi', surface: 'notch' }); assert.throws(() => validateTurn({ message: '', surface: 'shell' })); });
test('uses capped exponential retry delays with deterministic jitter', () => {
  assert.equal(retryDelayFor(1, () => 0), 500);
  assert.equal(retryDelayFor(2, () => 0.5), 1500);
  assert.equal(retryDelayFor(99, () => 1), 4000);
});
test('enforces provider response size and cancellation', async () => { const oversized = createTestClient({ endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'm', fetchImpl: async () => ({ ok: true, headers: { get: () => '1048577' }, text: async () => '' }) }); await assert.rejects(() => oversized.generate({ message: 'x' }), /1 MiB/); const runtime = createMainAiRuntime(); const response = await runtime.run({ message: 'hi', surface: 'desktop' }); assert.equal(response.providerLabel, 'Pixano local assistant'); });
test('bounds streamed SSE bodies before parsing their events', async () => {
  const client = createTestClient({ endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'm', fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => null }, body: { getReader: () => ({ read: async () => ({ done: false, value: Buffer.alloc(1024 * 1024 + 1) }), cancel: async () => {} }) } }) });

  await assert.rejects(() => client.generate({ message: 'x', surface: 'desktop' }), /1 MiB/);
});
test('tests the exact configured endpoint, credential, and model before saving', async () => {
  let request;
  const client = createTestClient({ endpoint: 'https://api.example.test/v1/chat/completions', apiKey: 'secret-value', model: 'gpt-test', fetchImpl: async (url, init) => { request = { url, init }; return { ok: true, headers: { get: () => '32' }, text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: 'Ready', toolCalls: [], notchPresentation: null }) } }] }) }; } });

  await client.testConnection();

  assert.equal(request.url.toString(), 'https://api.example.test/v1/chat/completions');
  assert.equal(request.init.headers.authorization, 'Bearer secret-value');
  assert.equal(JSON.parse(request.init.body).model, 'gpt-test');
});

test('uses the model reported by the provider and never follows redirects', async () => {
  let request;
  const client = createTestClient({ endpoint: 'https://api.example.test/v1/chat/completions', apiKey: 'secret-value', model: 'requested-model', fetchImpl: async (_url, init) => { request = init; return { ok: true, headers: { get: () => '32' }, text: async () => JSON.stringify({ model: 'reported-model', choices: [{ message: { content: JSON.stringify({ reply: 'Ready', toolCalls: [], notchPresentation: null }) } }] }) }; } });

  const result = await client.generate({ message: 'hello', surface: 'desktop' });

  assert.equal(result.model, 'reported-model');
  assert.equal(request.redirect, 'error');
});

test('rejects a connection test when the provider response is not the promised JSON contract', async () => {
  const client = createTestClient({ endpoint: 'https://api.example.test/v1/chat/completions', apiKey: 'secret-value', model: 'requested-model', fetchImpl: async () => ({ ok: true, headers: { get: () => '2' }, text: async () => JSON.stringify({ choices: [{ message: { content: 'OK' } }] }) }) });

  await assert.rejects(() => client.testConnection(), /invalid JSON contract/);
});

test('parses a bounded OpenAI-compatible SSE body into request-scoped delta, usage, and completed events', async () => {
  const events = [];
  const response = streamResponse([
    'data: {"choices":[{"delta":{"content":"hel"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"lo"}}],"usage":{"prompt_tokens":3,"completion_tokens":2}}\n\n',
    'data: [DONE]\n\n',
  ]);
  const client = createTestClient({ endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'm', onEvent: (event) => events.push(event), fetchImpl: async () => response });

  const result = await client.generate({ message: 'x', surface: 'desktop' });

  assert.equal(result.content, 'hello');
  assert.deepEqual(events, [
    { type: 'delta', delta: 'hel' },
    { type: 'delta', delta: 'lo' },
    { type: 'usage', usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 } },
    { type: 'completed' },
  ]);
});

test('uses the model reported in streamed SSE payloads for the final result', async () => {
  const client = createTestClient({ endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'requested-model', fetchImpl: async () => streamResponse([
    'data: {"model":"streamed-provider-model","choices":[{"delta":{"content":"hello"}}]}\n\n',
    'data: [DONE]\n\n',
  ]) });

  const result = await client.generate({ message: 'x', surface: 'desktop' });

  assert.equal(result.model, 'streamed-provider-model');
});

test('ignores every SSE frame after the terminal done marker', async () => {
  const events = [];
  const client = createTestClient({ endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'm', onEvent: (event) => events.push(event), fetchImpl: async () => streamResponse([
    'data: {"choices":[{"delta":{"content":"before"}}]}\n\n',
    'data: [DONE]\n\n',
    'data: {"choices":[{"delta":{"content":"after"}}]}\n\n',
    'data: not-json\n\n',
  ]) });

  const result = await client.generate({ message: 'x', surface: 'desktop' });

  assert.equal(result.content, 'before');
  assert.deepEqual(events, [{ type: 'delta', delta: 'before' }, { type: 'completed' }]);
});

test('fails safely without replaying visible SSE output when EOF arrives before done', async () => {
  const events = []; let calls = 0;
  const client = createTestClient({ endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'm', onEvent: (event) => events.push(event), sleep: async () => assert.fail('must not retry visible output'), fetchImpl: async () => {
    calls += 1;
    return streamResponse(['data: {"choices":[{"delta":{"content":"partial"}}]}\n\n']);
  } });

  await assert.rejects(() => client.generate({ message: 'x', surface: 'desktop' }), /unavailable/);

  assert.equal(calls, 1);
  assert.deepEqual(events, [
    { type: 'delta', delta: 'partial' },
    { type: 'failed', failure: { code: 'unavailable', retryable: false } },
  ]);
});

test('does not retry when the SSE reader fails after a visible delta', async () => {
  const events = []; let calls = 0; let reads = 0;
  const response = { ok: true, status: 200, headers: { get: () => null }, body: { getReader: () => ({
    read: async () => {
      reads += 1;
      if (reads === 1) return { done: false, value: encoder.encode('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n') };
      throw new TypeError('stream connection reset');
    },
    cancel: async () => {},
  }) } };
  const client = createTestClient({ endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'm', onEvent: (event) => events.push(event), sleep: async () => assert.fail('must not retry visible output'), fetchImpl: async () => {
    calls += 1;
    return response;
  } });

  await assert.rejects(() => client.generate({ message: 'x', surface: 'desktop' }), /unavailable/);

  assert.equal(calls, 1);
  assert.deepEqual(events, [
    { type: 'delta', delta: 'partial' },
    { type: 'failed', failure: { code: 'unavailable', retryable: false } },
  ]);
});

test('does not retry when the SSE timeout interrupts a visible delta', async () => {
  const events = []; let calls = 0; let reads = 0;
  const timeoutController = new AbortController();
  const response = { ok: true, status: 200, headers: { get: () => null }, body: { getReader: () => ({
    read: async () => {
      reads += 1;
      if (reads === 1) return { done: false, value: encoder.encode('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n') };
      timeoutController.abort();
      throw new Error('stream read interrupted');
    },
    cancel: async () => {},
  }) } };
  const client = createTestClient({ endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'm', onEvent: (event) => events.push(event), timeoutFactory: () => ({ signal: timeoutController.signal, dispose: () => {} }), sleep: async () => assert.fail('must not retry visible output'), fetchImpl: async () => {
    calls += 1;
    return response;
  } });

  await assert.rejects(() => client.generate({ message: 'x', surface: 'desktop' }), /unavailable/);

  assert.equal(calls, 1);
  assert.deepEqual(events, [
    { type: 'delta', delta: 'partial' },
    { type: 'failed', failure: { code: 'unavailable', retryable: false } },
  ]);
});

test('stops and cancels the SSE reader immediately after done', async () => {
  const events = []; let reads = 0; let cancels = 0;
  const response = { ok: true, status: 200, headers: { get: () => null }, body: { getReader: () => ({
    read: async () => {
      reads += 1;
      if (reads === 1) return { done: false, value: encoder.encode('data: {"choices":[{"delta":{"content":"complete"}}]}\n\n') };
      if (reads === 2) return { done: false, value: encoder.encode('data: [DONE]\n\n') };
      throw new Error('reader was used after completion');
    },
    cancel: async () => { cancels += 1; },
  }) } };
  const client = createTestClient({ endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'm', onEvent: (event) => events.push(event), sleep: async () => assert.fail('must not retry after completion'), fetchImpl: async () => response });

  const result = await client.generate({ message: 'x', surface: 'desktop' });

  assert.equal(result.content, 'complete');
  assert.equal(reads, 2);
  assert.equal(cancels, 1);
  assert.deepEqual(events, [{ type: 'delta', delta: 'complete' }, { type: 'completed' }]);
});

test('retries a valid SSE stream that reaches EOF before done without visible output', async () => {
  const events = []; const delays = []; let calls = 0;
  const client = createTestClient({ endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'm', onEvent: (event) => events.push(event), sleep: async (delayMs) => { delays.push(delayMs); }, fetchImpl: async () => {
    calls += 1;
    return calls === 1
      ? streamResponse(['data: {"usage":{"prompt_tokens":1,"completion_tokens":0}}\n\n'])
      : streamResponse(['data: {"choices":[{"delta":{"content":"recovered"}}]}\n\n', 'data: [DONE]\n\n']);
  } });

  const result = await client.generate({ message: 'x', surface: 'desktop' });

  assert.equal(result.content, 'recovered');
  assert.equal(calls, 2);
  assert.deepEqual(delays, [1_000]);
  assert.deepEqual(events.map((event) => event.type), ['usage', 'retrying', 'delta', 'completed']);
});

test('chunks an existing JSON completion response when streaming is unavailable', async () => {
  const requests = [];
  const events = [];
  const fallback = 'a'.repeat(8001);
  const client = createTestClient({ endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'm', onEvent: (event) => events.push(event), fetchImpl: async (_url, init) => { requests.push(JSON.parse(init.body)); return jsonResponse(providerJson(fallback)); } });

  const result = await client.generate({ message: 'x', surface: 'desktop' });

  assert.equal(result.content, fallback.slice(0, 8000));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].stream, true);
  assertBoundedDeltas(events, fallback);
  assert.equal(events.at(-1)?.type, 'completed');
});

test('chunks a single-use JSON response after probing its stream body', async () => {
  const fallback = 'b'.repeat(8001); const events = []; const bodyText = JSON.stringify(providerJson(fallback));
  let calls = 0; let textCalls = 0; let readerConsumed = false; let index = 0;
  const response = {
    ok: true, status: 200, headers: { get: () => null },
    body: { getReader: () => ({
      read: async () => index++ === 0 ? (readerConsumed = true, { done: false, value: encoder.encode(bodyText) }) : { done: true },
      cancel: async () => {},
    }) },
    text: async () => {
      textCalls += 1;
      if (readerConsumed) throw new Error('response body was already consumed');
      return bodyText;
    },
  };
  const client = createTestClient({ endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'm', onEvent: (event) => events.push(event), sleep: async () => assert.fail('must not retry a normal JSON response'), fetchImpl: async () => {
    calls += 1;
    return response;
  } });

  const result = await client.generate({ message: 'x', surface: 'desktop' });

  assert.equal(result.content, fallback.slice(0, 8000));
  assert.equal(calls, 1);
  assert.equal(textCalls, 0);
  assertBoundedDeltas(events, fallback);
  assert.equal(events.at(-1)?.type, 'completed');
});

test('chunks a non-streaming completion when the reader fails before valid frames', async () => {
  const fallback = 'c'.repeat(8001); const events = []; let calls = 0;
  const client = createTestClient({ endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'm', onEvent: (event) => events.push(event), fetchImpl: async (_url, init) => {
    calls += 1;
    if (calls === 1) return { ok: true, status: 200, headers: { get: () => null }, body: { getReader: () => ({ read: async () => { throw new TypeError('socket secret-value failed'); }, cancel: async () => {} }) } };
    assert.equal(JSON.parse(init.body).stream, undefined);
    return jsonResponse(providerJson(fallback));
  } });

  const result = await client.generate({ message: 'x', surface: 'desktop' });

  assert.equal(result.content, fallback.slice(0, 8000));
  assert.equal(calls, 2);
  assertBoundedDeltas(events, fallback);
  assert.equal(events.at(-1)?.type, 'completed');
});

test('counts pre-event stream fallbacks against the unavailable fetch budget', async () => {
  const requests = []; const delays = [];
  const streamFailure = () => ({ ok: true, status: 200, headers: { get: () => null }, body: { getReader: () => ({ read: async () => { throw Object.assign(new TypeError('network failed'), { code: 'ENOTFOUND' }); }, cancel: async () => {} }) } });
  const client = createTestClient({ endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'm', sleep: async (delay) => { delays.push(delay); }, fetchImpl: async (_url, init) => {
    requests.push(JSON.parse(init.body).stream === true ? 'stream' : 'json');
    return requests.length % 2 === 1 ? streamFailure() : jsonResponse({}, { status: 503 });
  } });

  await assert.rejects(() => client.generate({ message: 'x', surface: 'desktop' }), /unavailable/);

  assert.deepEqual(requests, ['stream', 'json', 'stream']);
  assert.deepEqual(delays, [1_000]);
});

test('classifies invalid credentials without retrying or exposing provider data', async () => {
  for (const status of [401, 403]) {
    const events = []; let calls = 0;
    const client = createTestClient({ endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'm', onEvent: (event) => events.push(event), fetchImpl: async () => { calls += 1; return jsonResponse({ error: { message: 'sk-secret raw provider detail' } }, { status }); } });

    await assert.rejects(() => client.generate({ message: 'x', surface: 'desktop' }), /invalid_credentials/);

    assert.equal(calls, 1);
    assert.deepEqual(events, [{ type: 'failed', failure: { code: 'invalid_credentials', retryable: false } }]);
    assert.doesNotMatch(JSON.stringify(events), /secret|provider detail/i);
  }
});

// Um 404 `model_not_found` é um id de modelo errado nos Ajustes, não uma resposta ilegível:
// chamá-lo de `invalid_response` foi o que mandou a primeira validação ao vivo investigar
// formatação de JSON. O código precisa nomear a requisição, não a resposta.
test('classifies rejected client requests as invalid_request without retrying or exposing provider text', async () => {
  for (const status of [400, 404, 422]) {
    const events = []; let calls = 0;
    const client = createTestClient({ endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'm', onEvent: (event) => events.push(event), sleep: async () => assert.fail('must not retry invalid client requests'), fetchImpl: async () => {
      calls += 1;
      return jsonResponse({ error: { message: 'raw client detail' } }, { status });
    } });

    await assert.rejects(() => client.generate({ message: 'x', surface: 'desktop' }), (error) => {
      assert.match(error.message, /invalid_request/);
      assert.doesNotMatch(error.message, /invalid_response/);
      assert.doesNotMatch(error.message, /raw client detail/i);
      return true;
    });

    assert.equal(calls, 1);
    assert.deepEqual(events, [{ type: 'failed', failure: { code: 'invalid_request', retryable: false } }]);
  }
});

// Os 4xx restantes também são a requisição, e nenhum deles melhora ao repetir: cair no
// `unavailable` retentável seria trocar um rótulo errado por chamadas inúteis.
test('keeps every other client status as a non-retryable invalid request', async () => {
  for (const status of [405, 409, 413, 415]) {
    const events = []; let calls = 0;
    const client = createTestClient({ endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'm', onEvent: (event) => events.push(event), sleep: async () => assert.fail('must not retry invalid client requests'), fetchImpl: async () => {
      calls += 1;
      return jsonResponse({ error: { message: 'raw client detail' } }, { status });
    } });

    await assert.rejects(() => client.generate({ message: 'x', surface: 'desktop' }), /invalid_request/);

    assert.equal(calls, 1);
    assert.deepEqual(events, [{ type: 'failed', failure: { code: 'invalid_request', retryable: false } }]);
  }
});

// A contrapartida: `invalid_response` continua existindo, para a resposta que de facto não se lê.
test('still reports a genuinely unparseable body as invalid_response', async () => {
  const events = []; let calls = 0;
  const client = createTestClient({ endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'm', onEvent: (event) => events.push(event), sleep: async () => assert.fail('must not retry an unreadable response'), fetchImpl: async () => {
    calls += 1;
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => 'not json at all' };
  } });

  // Aqui a mensagem segura do erro substitui o código, então quem afirma o contrato é o evento.
  await assert.rejects(() => client.generate({ message: 'x', surface: 'desktop' }), /invalid response/i);

  assert.equal(calls, 1);
  assert.deepEqual(events, [{ type: 'failed', failure: { code: 'invalid_response', retryable: false } }]);
});

test('retries HTTP request timeouts within the unavailable fetch budget', async () => {
  const events = []; const delays = []; let calls = 0;
  const client = createTestClient({ endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'm', onEvent: (event) => events.push(event), sleep: async (delay) => { delays.push(delay); }, fetchImpl: async () => {
    calls += 1;
    return jsonResponse({ error: { message: 'raw timeout detail' } }, { status: 408 });
  } });

  await assert.rejects(() => client.generate({ message: 'x', surface: 'desktop' }), /unavailable/);

  assert.equal(calls, 3);
  assert.deepEqual(delays, [1_000, 2_000]);
  assert.deepEqual(events, [
    { type: 'retrying', attempt: 1, delayMs: 1_000, failure: { code: 'unavailable', retryable: true } },
    { type: 'retrying', attempt: 2, delayMs: 2_000, failure: { code: 'unavailable', retryable: true } },
    { type: 'failed', failure: { code: 'unavailable', retryable: true } },
  ]);
});

test('stops after the exact global rate-limited fetch budget', async () => {
  const events = []; const delays = []; let calls = 0;
  const client = createTestClient({ endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'm', onEvent: (event) => events.push(event), sleep: async (delay) => { delays.push(delay); }, fetchImpl: async () => { calls += 1; return jsonResponse({}, { status: 429, headers: { 'retry-after': '120' } }); } });

  await assert.rejects(() => client.generate({ message: 'x', surface: 'desktop' }), /rate_limited/);

  assert.equal(calls, 2);
  assert.deepEqual(delays, [60_000]);
  assert.deepEqual(events, [
    { type: 'retrying', attempt: 1, delayMs: 60_000, failure: { code: 'rate_limited', retryable: true, retryAfterMs: 60_000 } },
    { type: 'failed', failure: { code: 'rate_limited', retryable: true, retryAfterMs: 60_000 } },
  ]);
});

test('stops after the exact global unavailable fetch budget', async () => {
  const events = []; const delays = []; let calls = 0;
  const client = createTestClient({ endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'm', onEvent: (event) => events.push(event), sleep: async (delay) => { delays.push(delay); }, fetchImpl: async () => { calls += 1; throw Object.assign(new TypeError('network failed'), { code: 'ENOTFOUND' }); } });

  await assert.rejects(() => client.generate({ message: 'x', surface: 'desktop' }), /unavailable/);

  assert.equal(calls, 3);
  assert.deepEqual(delays, [1_000, 2_000]);
  assert.deepEqual(events.map((event) => event.type), ['retrying', 'retrying', 'failed']);
  assert.deepEqual(events[0].failure, { code: 'unavailable', retryable: true });
});

test('cancelling during the default retry wait clears its timer and emits one terminal failure', async () => {
  const events = []; let calls = 0; let timer; let clearCalls = 0;
  const originalSetTimeout = global.setTimeout; const originalClearTimeout = global.clearTimeout;
  global.setTimeout = (callback, delayMs) => (timer = { callback, delayMs });
  global.clearTimeout = (candidate) => { if (candidate === timer) clearCalls += 1; };
  try {
    const client = createTestClient({ endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'm', onEvent: (event) => events.push(event), fetchImpl: async () => {
      calls += 1;
      return jsonResponse({}, { status: 503 });
    } });
    const controller = new AbortController();
    const pending = client.generate({ message: 'x', surface: 'desktop' }, controller.signal);
    await flushMicrotasks();
    controller.abort();

    await assert.rejects(() => pending, /cancelled/);

    assert.equal(calls, 1);
    assert.equal(timer.delayMs, 1_000);
    assert.equal(clearCalls, 1);
    assert.deepEqual(events, [
      { type: 'retrying', attempt: 1, delayMs: 1_000, failure: { code: 'unavailable', retryable: true } },
      { type: 'failed', failure: { code: 'cancelled', retryable: false } },
    ]);
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});

test('classifies injected request timeouts as unavailable and retries with injected delays', async () => {
  const events = []; const delays = []; let calls = 0;
  let timeoutFactories = 0;
  const client = createTestClient({ endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'm', timeoutMs: 60_000, timeoutFactory: () => {
    timeoutFactories += 1;
    const controller = new AbortController();
    queueMicrotask(() => controller.abort());
    return { signal: controller.signal, dispose: () => {} };
  }, onEvent: (event) => events.push(event), sleep: async (delay) => { delays.push(delay); }, fetchImpl: async (_url, init) => {
    calls += 1;
    await new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('fetch aborted', 'AbortError')), { once: true }));
  } });

  await assert.rejects(() => client.generate({ message: 'x', surface: 'desktop' }), /unavailable/);

  assert.equal(calls, 3);
  assert.equal(timeoutFactories, 3);
  assert.deepEqual(delays, [1_000, 2_000]);
  assert.deepEqual(events.map((event) => event.type), ['retrying', 'retrying', 'failed']);
  assert.deepEqual(events.at(-1).failure, { code: 'unavailable', retryable: true });
});

test('injects request timeouts through the main runtime without real timers', async () => {
  let timeoutFactories = 0; let calls = 0;
  const runtime = createMainAiRuntime({ config: { endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'm' }, sleep: async () => {}, timeoutFactory: () => {
    timeoutFactories += 1;
    const controller = new AbortController();
    return { signal: controller.signal, dispose: () => {} };
  }, fetchImpl: async () => {
    calls += 1;
    return jsonResponse({}, { status: 503 });
  } });

  await assert.rejects(() => runtime.run({ message: 'x', surface: 'desktop' }), /unavailable/);

  assert.equal(calls, 3);
  assert.equal(timeoutFactories, 3);
});

test('scopes same-sender supersession events to bounded main-generated request ids and renderer correlations', async () => {
  const callbacks = []; const resolveRuns = []; const events = [];
  const coordinator = createAiRequestCoordinator({ runtime: { run: async (_turn, { onEvent }) => new Promise((resolve) => { callbacks.push(onEvent); resolveRuns.push(resolve); }), cancel: () => {} }, createRequestId: (() => { let next = 0; return () => `request-${++next}`; })() });
  const sender = { id: 1 };
  const first = coordinator.run(sender, { message: 'first' }, 'renderer-first', (event) => events.push(event));
  callbacks[0]({ type: 'delta', delta: 'one' });
  const second = coordinator.run(sender, { message: 'second' }, 'renderer-second', (event) => events.push(event));
  callbacks[0]({ type: 'delta', delta: 'stale' });
  callbacks[1]({ type: 'completed' });

  assert.deepEqual(events, [
    { type: 'started', requestId: 'request-1', correlationId: 'renderer-first' },
    { type: 'delta', delta: 'one', requestId: 'request-1', correlationId: 'renderer-first' },
    { type: 'started', requestId: 'request-2', correlationId: 'renderer-second' },
    { type: 'completed', requestId: 'request-2', correlationId: 'renderer-second' },
  ]);
  assert.equal(events.every((event) => typeof event.requestId === 'string' && event.requestId.length <= 128), true);

  resolveRuns[0]({}); resolveRuns[1]({});
  await Promise.all([first, second]);
});

test('emits a request-scoped started event before any provider event and returns both ownership ids', async () => {
  const events = [];
  const coordinator = createAiRequestCoordinator({ runtime: { run: async (_turn, { onEvent }) => {
    onEvent({ type: 'delta', delta: 'ready' });
    return { content: 'ready', providerLabel: 'Remote', model: 'remote-model' };
  }, cancel: () => {} }, createRequestId: () => 'request-started' });

  const result = await coordinator.run({ id: 1 }, { message: 'hello' }, 'renderer-started', (event) => events.push(event));

  assert.deepEqual(events, [
    { type: 'started', requestId: 'request-started', correlationId: 'renderer-started' },
    { type: 'delta', delta: 'ready', requestId: 'request-started', correlationId: 'renderer-started' },
  ]);
  assert.equal(result.requestId, 'request-started');
  assert.equal(result.correlationId, 'renderer-started');
});

test('rejects a different sender while an AI request is active', async () => {
  let resolveRun; let runs = 0;
  const senderA = { id: 1 }; const senderB = { id: 2 };
  const coordinator = createAiRequestCoordinator({ runtime: { run: async () => {
    runs += 1;
    return runs === 1 ? new Promise((resolve) => { resolveRun = resolve; }) : { unexpected: true };
  }, cancel: () => {} }, createRequestId: () => 'request-owner' });
  const pending = coordinator.run(senderA, { message: 'x' }, 'renderer-owner-a', () => {});

  await assert.rejects(() => coordinator.run(senderB, { message: 'y' }, 'renderer-owner-b', () => {}), /already active/);
  assert.equal(runs, 1);

  resolveRun({}); await pending;
});

test('cancels and clears an active request when its sender is destroyed', async () => {
  const sender = new EventEmitter(); let resolveRun; let cancels = 0;
  const coordinator = createAiRequestCoordinator({ runtime: { run: async () => new Promise((resolve) => { resolveRun = resolve; }), cancel: () => { cancels += 1; } }, createRequestId: () => 'request-owner' });
  const pending = coordinator.run(sender, { message: 'x' }, 'renderer-destroyed', () => {});

  sender.emit('destroyed');

  assert.equal(cancels, 1);
  assert.equal(coordinator.cancel(sender), false);
  assert.equal(sender.listenerCount('destroyed'), 0);
  resolveRun({}); await pending;
});

test('disposes active work before replacing an AI request coordinator', async () => {
  const sender = { id: 1 }; let resolveRun; let cancels = 0;
  const previous = createAiRequestCoordinator({ runtime: { run: async () => new Promise((resolve) => { resolveRun = resolve; }), cancel: () => { cancels += 1; } }, createRequestId: () => 'previous-request' });
  const pending = previous.run(sender, { message: 'x' }, 'renderer-previous', () => {});

  const next = replaceAiRequestCoordinator(previous, { run: async () => ({}), cancel: () => {} });

  assert.equal(cancels, 1);
  assert.equal(previous.cancel(sender), false);
  assert.equal(typeof next.run, 'function');
  resolveRun({}); await pending;
});

test('allows cancellation only from the sender that owns the exact active AI request', async () => {
  let resolveRun; let cancels = 0;
  const senderA = { id: 1 }; const senderB = { id: 2 };
  const coordinator = createAiRequestCoordinator({ runtime: { run: async () => new Promise((resolve) => { resolveRun = resolve; }), cancel: () => { cancels += 1; } }, createRequestId: () => 'request-owner' });
  const pending = coordinator.run(senderA, { message: 'x' }, 'renderer-cancel', () => {});

  assert.equal(coordinator.cancel(senderB, 'request-owner'), false);
  assert.equal(cancels, 0);
  assert.equal(coordinator.cancel(senderA, 'wrong-request'), false);
  assert.equal(cancels, 0);
  assert.equal(coordinator.cancel(senderA, 'request-owner'), true);
  assert.equal(cancels, 1);

  resolveRun({}); await pending;
  assert.equal(coordinator.cancel(senderA, 'request-owner'), false);
});

test('preserves JSON provider usage in the main runtime result', async () => {
  const runtime = createMainAiRuntime({ config: { endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'configured-model' }, fetchImpl: async () => jsonResponse({ model: 'reported-model', usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 19 }, choices: [{ message: { content: JSON.stringify({ reply: 'Ready', toolCalls: [], notchPresentation: null }) } }] }) });

  const result = await runtime.run({ message: 'hello', surface: 'desktop' });

  assert.deepEqual(result.usage, { inputTokens: 12, outputTokens: 5, totalTokens: 19 });
});

test('preserves a zero total reported by a JSON provider response', async () => {
  const runtime = createMainAiRuntime({ config: { endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'configured-model' }, fetchImpl: async () => jsonResponse({ model: 'reported-model', usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 0 }, choices: [{ message: { content: JSON.stringify({ reply: 'Ready', toolCalls: [], notchPresentation: null }) } }] }) });

  const result = await runtime.run({ message: 'hello', surface: 'desktop' });

  assert.deepEqual(result.usage, { inputTokens: 12, outputTokens: 5, totalTokens: 0 });
});

test('cancels the stream reader and emits only a safe cancellation without retrying or falling back', async () => {
  const events = []; let calls = 0; let rejectRead;
  const response = { ok: true, status: 200, headers: { get: () => null }, body: { getReader: () => ({ read: () => new Promise((_resolve, reject) => { rejectRead = reject; }), cancel: async () => { rejectRead(new DOMException('cancelled', 'AbortError')); } }) } };
  const client = createTestClient({ endpoint: 'https://api.example.test', apiKey: 'sk-secret', model: 'm', onEvent: (event) => events.push(event), sleep: async () => assert.fail('must not sleep after cancellation'), fetchImpl: async () => { calls += 1; return response; } });
  const controller = new AbortController();
  const pending = client.generate({ message: 'x', surface: 'desktop' }, controller.signal);
  await flushMicrotasks();
  controller.abort();

  await assert.rejects(() => pending, /cancelled/);

  assert.equal(calls, 1);
  assert.deepEqual(events, [{ type: 'failed', failure: { code: 'cancelled', retryable: false } }]);
});

import test from 'node:test'
import assert from 'node:assert/strict'
import { readLiveProviderConfig, runLiveProviderTest, runProviderFailureChecks } from './test-live-providers.mjs'

test('refuses live provider traffic without explicit opt-in and a host allowlist', () => {
  assert.throws(() => readLiveProviderConfig({ HIBI_LIVE_PROVIDER_ENDPOINT: 'https://sandbox.example.test/v1/chat/completions', HIBI_LIVE_PROVIDER_MODEL: 'test', HIBI_LIVE_PROVIDER_KEY: 'secret', HIBI_LIVE_PROVIDER_ALLOW_HOSTS: 'sandbox.example.test' }), /HIBI_LIVE_PROVIDER_TEST=1/)
  assert.throws(() => readLiveProviderConfig({ HIBI_LIVE_PROVIDER_TEST: '1', HIBI_LIVE_PROVIDER_ENDPOINT: 'https://outside.example.test/v1/chat/completions', HIBI_LIVE_PROVIDER_MODEL: 'test', HIBI_LIVE_PROVIDER_KEY: 'secret', HIBI_LIVE_PROVIDER_ALLOW_HOSTS: 'sandbox.example.test' }), /allowlist/)
})

test('accepts an explicitly opted-in sandbox configuration without returning the key', () => {
  const config = readLiveProviderConfig({ HIBI_LIVE_PROVIDER_TEST: '1', HIBI_LIVE_PROVIDER_ENDPOINT: 'https://sandbox.example.test/v1/chat/completions', HIBI_LIVE_PROVIDER_MODEL: 'test', HIBI_LIVE_PROVIDER_KEY: 'secret', HIBI_LIVE_PROVIDER_ALLOW_HOSTS: 'sandbox.example.test' })

  assert.deepEqual(config, { endpoint: 'https://sandbox.example.test/v1/chat/completions', host: 'sandbox.example.test', model: 'test' })
  assert.equal(JSON.stringify(config).includes('secret'), false)
})

// Um provedor compatível com OpenAI devolve SSE. O conteúdo agregado precisa ser o contrato do
// Hibi (reply, toolCalls, notchPresentation), senão o runtime recusa antes de emitir eventos.
const sseResponse = (chunks) => new Response(new ReadableStream({
  start(controller) {
    const encoder = new TextEncoder()
    for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
    controller.close()
  },
}), { status: 200, headers: { 'content-type': 'text/event-stream' } })

const delta = (content) => `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content } }] })}\n\n`
const streamingProvider = () => sseResponse([
  delta('{"reply":"ok",'),
  delta('"toolCalls":[],"notchPresentation":null}'),
  `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 } })}\n\n`,
  'data: [DONE]\n\n',
])

const sandboxEnvironment = {
  HIBI_LIVE_PROVIDER_TEST: '1',
  HIBI_LIVE_PROVIDER_ENDPOINT: 'https://sandbox.example.test/v1/chat/completions',
  HIBI_LIVE_PROVIDER_MODEL: 'test-model',
  HIBI_LIVE_PROVIDER_KEY: 'secret',
  HIBI_LIVE_PROVIDER_ALLOW_HOSTS: 'sandbox.example.test',
}

// O relatório existia mas nunca via um evento: o callback era passado como terceiro argumento de
// `run`, que só aceita dois — os eventos chegam por `requestOptions.onEvent`. Sem isto, um provedor
// que nem streamasse passaria no teste ao vivo sem ninguém perceber.
test('records the streaming events the provider emitted', async () => {
  const report = await runLiveProviderTest(sandboxEnvironment, { fetchImpl: async () => streamingProvider() })

  assert.ok(report.eventTypes.includes('delta'), `esperava deltas, veio ${JSON.stringify(report.eventTypes)}`)
  assert.ok(report.eventTypes.includes('usage'))
  assert.equal(report.eventTypes.at(-1), 'completed')
})

test('reports provenance and usage without leaking the key', async () => {
  const report = await runLiveProviderTest(sandboxEnvironment, { fetchImpl: async () => streamingProvider() })

  assert.equal(report.endpointHost, 'sandbox.example.test')
  assert.equal(report.provider, 'OpenAI-compatible')
  assert.deepEqual(report.usage, { inputTokens: 11, outputTokens: 7, totalTokens: 18 })
  assert.equal(JSON.stringify(report).includes('secret'), false)
})

const status = (code) => new Response('{"error":{"message":"x"}}', { status: code, headers: { 'content-type': 'application/json' } })
const neverEnding = () => new Response(new ReadableStream({
  start(controller) { controller.enqueue(new TextEncoder().encode(delta('{"reply":"'))) },
}), { status: 200, headers: { 'content-type': 'text/event-stream' } })

// O item 2 da Fase 3 pede cancelamento exercitado, não declarado: o relatório trazia `cancelled`
// fixo em false, então um cancelamento quebrado passaria despercebido numa validação ao vivo.
test('cancels a turn in flight and reports the real outcome', async () => {
  const report = await runLiveProviderTest(sandboxEnvironment, { fetchImpl: async () => neverEnding(), cancelAfterMs: 10 })

  assert.equal(report.cancelled, true)
})

// 401, 429 e indisponibilidade não dá para forçar contra um provedor real sem sujar a conta: são
// exercitados com respostas injetadas, e o relatório precisa dizer que foram simulados.
test('classifies credential, rate limit and unavailable failures as simulated', async () => {
  // 401 não se repete, 429 e 5xx sim: a fila precisa alimentar cada tentativa do runtime.
  const statuses = [401, 429, 429, 500, 500, 500]
  let calls = 0
  const checks = await runProviderFailureChecks({
    fetchImpl: async () => { calls += 1; return status(statuses.shift() ?? 500) },
    sleep: async () => {},
  })

  assert.equal(checks.simulated, true)
  assert.equal(checks.invalidCredentials, 'invalid_credentials')
  assert.equal(checks.rateLimited, 'rate_limited')
  assert.equal(checks.unavailable, 'unavailable')
  assert.ok(calls > 3, `esperava repetição nas falhas temporárias, houve ${calls} chamadas`)
})

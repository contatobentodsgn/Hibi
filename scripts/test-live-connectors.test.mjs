import test from 'node:test'
import assert from 'node:assert/strict'
import { readLiveConnectorConfig, runLiveConnectorTest } from './test-live-connectors.mjs'

const base = {
  HIBI_LIVE_CONNECTOR_TEST: '1',
  HIBI_LIVE_CONNECTOR_ID: 'slack',
  HIBI_LIVE_CONNECTOR_ENDPOINT: 'https://sandbox.example.test/api/',
  HIBI_LIVE_CONNECTOR_TOKEN: 'token-secreto',
  HIBI_LIVE_CONNECTOR_ALLOW_HOSTS: 'sandbox.example.test',
}

test('recusa tráfego real sem opt-in explícito, conector conhecido e allowlist de host', () => {
  assert.throws(() => readLiveConnectorConfig({ ...base, HIBI_LIVE_CONNECTOR_TEST: undefined }), /HIBI_LIVE_CONNECTOR_TEST=1/)
  assert.throws(() => readLiveConnectorConfig({ ...base, HIBI_LIVE_CONNECTOR_ID: 'desconhecido' }), /HIBI_LIVE_CONNECTOR_ID/)
  assert.throws(() => readLiveConnectorConfig({ ...base, HIBI_LIVE_CONNECTOR_ENDPOINT: 'https://fora.example.test/api/' }), /allowlist/)
  assert.throws(() => readLiveConnectorConfig({ ...base, HIBI_LIVE_CONNECTOR_ENDPOINT: 'http://sandbox.example.test/api/' }), /allowlist/)
  assert.throws(() => readLiveConnectorConfig({ ...base, HIBI_LIVE_CONNECTOR_TOKEN: undefined }), /token/)
})

test('aceita uma configuração de sandbox sem devolver o token', () => {
  const config = readLiveConnectorConfig({ ...base, HIBI_LIVE_CONNECTOR_TARGETS: 'C1, C2' })
  assert.deepEqual(config, { connectorId: 'slack', endpoint: 'https://sandbox.example.test/api/', host: 'sandbox.example.test', targets: [{ id: 'C1' }, { id: 'C2' }], write: null })
  assert.equal(JSON.stringify(config).includes('token-secreto'), false)
})

test('a leitura autorizada não autoriza escrita por si só', () => {
  assert.equal(readLiveConnectorConfig(base).write, null)
  assert.throws(() => readLiveConnectorConfig({ ...base, HIBI_LIVE_CONNECTOR_WRITE_TEST: '1' }), /WRITE_KIND/)
  assert.throws(() => readLiveConnectorConfig({ ...base, HIBI_LIVE_CONNECTOR_WRITE_TEST: '1', HIBI_LIVE_CONNECTOR_WRITE_KIND: 'slack.post' }), /WRITE_PAYLOAD as JSON/)
  assert.throws(() => readLiveConnectorConfig({ ...base, HIBI_LIVE_CONNECTOR_WRITE_TEST: '1', HIBI_LIVE_CONNECTOR_WRITE_KIND: 'slack.post', HIBI_LIVE_CONNECTOR_WRITE_PAYLOAD: '[]' }), /JSON object/)

  const config = readLiveConnectorConfig({ ...base, HIBI_LIVE_CONNECTOR_WRITE_TEST: '1', HIBI_LIVE_CONNECTOR_WRITE_KIND: 'slack.post', HIBI_LIVE_CONNECTOR_WRITE_PAYLOAD: '{"channel":"#geral","text":"oi"}' })
  assert.deepEqual(config.write, { kind: 'slack.post', payload: { channel: '#geral', text: 'oi' } })
})

test('o relatório de leitura traz contagens e nenhum conteúdo importado', async () => {
  const responses = {
    'auth.test': { ok: true, team: 'Estúdio' },
    'conversations.list': { ok: true, channels: [{ id: 'C1', name: 'geral' }] },
    'stars.list': { ok: true, items: [{ channel: 'C1', message: { ts: '1.1', text: 'assunto confidencial' } }] },
  }
  const fetchStub = async (url) => {
    const key = Object.keys(responses).find((path) => String(url).includes(path))
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => responses[key] ?? {} }
  }

  const report = await runLiveConnectorTest({ ...base, HIBI_LIVE_CONNECTOR_TARGETS: 'C1' }, fetchStub)
  assert.equal(report.connection.ok, true)
  assert.deepEqual(report.importRead, { count: 1, kinds: ['task'], withRevision: 1 })
  assert.equal(report.write.attempted, false)

  const serialized = JSON.stringify(report)
  assert.equal(serialized.includes('assunto confidencial'), false)
  assert.equal(serialized.includes('token-secreto'), false)
  assert.equal(serialized.includes('Estúdio'), false)
  assert.deepEqual(report.connection, { ok: true })
  assert.ok(report.audit.every((entry) => !Object.hasOwn(entry, 'detail')))
})

test('a escrita real só acontece com o segundo opt-in e não ecoa a mensagem enviada', async () => {
  const sent = []
  const fetchStub = async (url, init) => {
    if (String(url).includes('chat.postMessage')) { sent.push(init.body); return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ ok: true, id: 'remote-1' }) } }
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ ok: true, team: 'Estúdio', items: [], channels: [] }) }
  }
  const write = { HIBI_LIVE_CONNECTOR_WRITE_KIND: 'slack.post', HIBI_LIVE_CONNECTOR_WRITE_PAYLOAD: '{"channel":"#geral","text":"mensagem privada"}' }

  const readOnly = await runLiveConnectorTest({ ...base, ...write }, fetchStub)
  assert.deepEqual(readOnly.write, { attempted: false })
  assert.deepEqual(sent, [])

  const withWrite = await runLiveConnectorTest({ ...base, ...write, HIBI_LIVE_CONNECTOR_WRITE_TEST: '1' }, fetchStub)
  assert.deepEqual(withWrite.write, { attempted: true, kind: 'slack.post', ok: true, status: 200, receivedRemoteId: true })
  assert.equal(sent.length, 1)
  assert.equal(JSON.stringify(withWrite).includes('mensagem privada'), false)
  assert.ok(withWrite.audit.every((entry) => !Object.hasOwn(entry, 'detail')))
})

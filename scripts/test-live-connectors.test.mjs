import test from 'node:test'
import assert from 'node:assert/strict'
import { readLiveConnectorConfig, readNotionLifecycleConfig, runLiveConnectorTest } from './test-live-connectors.mjs'

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

// Notion em memória, fiel ao contrato que o conector usa: consulta por data source,
// criação em `pages`, atualização em `pages/{id}` e `last_edited_time` que muda a cada
// escrita — é essa mudança que produz o lado remoto do conflito.
const fakeNotion = () => {
  const pages = new Map()
  let clock = 0
  const stamp = () => `2026-09-10T00:00:${String(clock++).padStart(2, '0')}.000Z`
  const respond = (body) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => body })
  const calls = { create: 0, update: 0 }
  const fetchStub = async (url, init) => {
    const path = String(url)
    if (path.includes('users/me')) return respond({ object: 'user' })
    if (path.includes('/query')) return respond({ results: [...pages.values()], has_more: false })
    const patch = /pages\/([^/?]+)$/.exec(path)
    if (patch && init?.method === 'PATCH') {
      calls.update += 1
      const id = decodeURIComponent(patch[1])
      const current = pages.get(id)
      const next = { ...current, properties: JSON.parse(init.body).properties, last_edited_time: stamp() }
      pages.set(id, next)
      return respond(next)
    }
    if (path.endsWith('pages')) {
      calls.create += 1
      const id = `page-${pages.size + 1}`
      const page = { id, object: 'page', properties: JSON.parse(init.body).properties, last_edited_time: stamp() }
      pages.set(id, page)
      return respond(page)
    }
    return respond({})
  }
  return { fetchStub, calls, pages }
}

const notionBase = {
  HIBI_LIVE_CONNECTOR_TEST: '1',
  HIBI_LIVE_CONNECTOR_ID: 'notion',
  HIBI_LIVE_CONNECTOR_ENDPOINT: 'https://api.notion.test/v1/',
  HIBI_LIVE_CONNECTOR_TOKEN: 'token-secreto',
  HIBI_LIVE_CONNECTOR_ALLOW_HOSTS: 'api.notion.test',
  HIBI_LIVE_CONNECTOR_TARGETS: 'source-1',
}
const lifecycleEnv = { ...notionBase, HIBI_LIVE_CONNECTOR_WRITE_TEST: '1', HIBI_LIVE_NOTION_LIFECYCLE: '1', HIBI_LIVE_NOTION_DATA_SOURCE: 'source-1' }

test('o ciclo de vida do Notion é um terceiro opt-in, acima da leitura e da escrita', () => {
  assert.equal(readNotionLifecycleConfig(notionBase), null)
  assert.throws(() => readNotionLifecycleConfig({ ...notionBase, HIBI_LIVE_NOTION_LIFECYCLE: '1' }), /WRITE_TEST=1/)
  assert.throws(() => readNotionLifecycleConfig({ ...notionBase, HIBI_LIVE_NOTION_LIFECYCLE: '1', HIBI_LIVE_CONNECTOR_WRITE_TEST: '1' }), /HIBI_LIVE_NOTION_DATA_SOURCE/)
  assert.throws(() => readNotionLifecycleConfig({ ...lifecycleEnv, HIBI_LIVE_CONNECTOR_ID: 'slack' }), /HIBI_LIVE_CONNECTOR_ID=notion/)
  assert.deepEqual(readNotionLifecycleConfig(lifecycleEnv), { dataSourceId: 'source-1' })
})

test('sem o opt-in do ciclo de vida, uma leitura autorizada não escreve nada', async () => {
  const notion = fakeNotion()
  const report = await runLiveConnectorTest(notionBase, notion.fetchStub)
  assert.equal(report.notionLifecycle, undefined)
  assert.deepEqual(notion.calls, { create: 0, update: 0 })
})

test('o ciclo de vida cria, lê de volta, atualiza e detecta um conflito real de dois lados', async () => {
  const notion = fakeNotion()
  const report = await runLiveConnectorTest(lifecycleEnv, notion.fetchStub)
  const lifecycle = report.notionLifecycle

  assert.equal(lifecycle.reusedExistingFixture, false)
  assert.deepEqual(lifecycle.create, { ok: true, receivedRemoteId: true })
  assert.deepEqual(lifecycle.read, { mappedTitle: true, hasRevision: true, hasDuration: true })
  assert.deepEqual(lifecycle.updateVisible, { durationApplied: true, revisionChanged: true })
  // O conflito é real: a revisão remota mudou porque a etapa anterior editou a página.
  assert.deepEqual(lifecycle.conflict, { detected: true, defaultDecision: 'skip', writesNothingByDefault: true })
  assert.equal(lifecycle.outcome, 'passed')
  assert.deepEqual(notion.calls, { create: 1, update: 1 })
  assert.equal(JSON.stringify(report).includes('token-secreto'), false)
})

test('repetir o ciclo de vida reaproveita a mesma tarefa em vez de acumular lixo', async () => {
  const notion = fakeNotion()
  await runLiveConnectorTest(lifecycleEnv, notion.fetchStub)
  const second = await runLiveConnectorTest(lifecycleEnv, notion.fetchStub)

  assert.equal(second.notionLifecycle.reusedExistingFixture, true)
  assert.equal(second.notionLifecycle.outcome, 'passed')
  assert.equal(notion.pages.size, 1)
  assert.deepEqual(notion.calls, { create: 1, update: 2 })
})

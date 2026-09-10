import { createIntegrationManager } from '../electron/integrations.cjs'
import { createNotionConnector } from '../electron/connectors/notion.cjs'
import { createSlackConnector } from '../electron/connectors/slack.cjs'
import { createEmailConnector } from '../electron/connectors/email.cjs'
import { createRemoteNotificationConnector } from '../electron/connectors/remote-notifications.cjs'
import { buildNotionSyncPlan, defaultDecisionFor, notionRecordFromCandidate, notionTaskHash } from '../src/integrations/notion-sync.ts'

const FACTORIES = {
  notion: createNotionConnector,
  slack: createSlackConnector,
  email: createEmailConnector,
  'remote-notifications': createRemoteNotificationConnector,
}

const bounded = (value, maximum) => typeof value === 'string' && value.trim() && value.length <= maximum

// A leitura e a escrita têm opt-ins separados de propósito: autorizar um teste de
// importação nunca deve, por si só, autorizar uma escrita real no serviço.
export function readLiveConnectorConfig(environment = process.env) {
  if (environment.HIBI_LIVE_CONNECTOR_TEST !== '1') throw new Error('Set HIBI_LIVE_CONNECTOR_TEST=1 to permit a real connector test.')
  const connectorId = environment.HIBI_LIVE_CONNECTOR_ID
  const endpoint = environment.HIBI_LIVE_CONNECTOR_ENDPOINT
  const token = environment.HIBI_LIVE_CONNECTOR_TOKEN
  const allowed = (environment.HIBI_LIVE_CONNECTOR_ALLOW_HOSTS ?? '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)
  if (!Object.hasOwn(FACTORIES, String(connectorId))) throw new Error(`Live connector test requires HIBI_LIVE_CONNECTOR_ID to be one of: ${Object.keys(FACTORIES).join(', ')}.`)
  if (!bounded(endpoint, 2_048) || !bounded(token, 8_192) || allowed.length === 0) throw new Error('Live connector test requires an endpoint, a token, and an allowlisted host.')
  let url
  try { url = new URL(endpoint) } catch { throw new Error('Live connector endpoint is invalid.') }
  if (url.protocol !== 'https:' || !allowed.includes(url.hostname.toLowerCase())) throw new Error('Live connector endpoint is not on the explicit HTTPS allowlist.')

  const targets = (environment.HIBI_LIVE_CONNECTOR_TARGETS ?? '').split(',').map((value) => value.trim()).filter(Boolean).map((id) => ({ id }))

  let write = null
  // Com o ciclo de vida do Notion ligado, a escrita genérica é opcional: as escritas
  // já são as do próprio ciclo, e exigir uma avulsa aqui só produziria lixo extra.
  const lifecycleEnabled = environment.HIBI_LIVE_NOTION_LIFECYCLE === '1'
  if (environment.HIBI_LIVE_CONNECTOR_WRITE_TEST === '1' && !(lifecycleEnabled && environment.HIBI_LIVE_CONNECTOR_WRITE_KIND === undefined)) {
    const kind = environment.HIBI_LIVE_CONNECTOR_WRITE_KIND
    if (!bounded(kind, 120)) throw new Error('A real write requires HIBI_LIVE_CONNECTOR_WRITE_KIND.')
    let payload
    try { payload = JSON.parse(environment.HIBI_LIVE_CONNECTOR_WRITE_PAYLOAD ?? '') } catch { throw new Error('A real write requires HIBI_LIVE_CONNECTOR_WRITE_PAYLOAD as JSON.') }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('A real write requires HIBI_LIVE_CONNECTOR_WRITE_PAYLOAD as a JSON object.')
    write = { kind, payload }
  }

  return { connectorId, endpoint: url.toString(), host: url.hostname.toLowerCase(), targets, write }
}

// Keychain só de memória: o token do sandbox nunca toca o Keychain do macOS
// nem o disco por causa deste harness.
const inMemoryKeychain = (connectorId, token) => {
  const values = new Map([[`integration:${connectorId}`, token]])
  return {
    async set(account, secret) { values.set(account, secret) },
    async get(account) { return values.get(account) },
    async has(account) { return values.has(account) },
    async remove(account) { values.delete(account) },
  }
}

// O ciclo de vida é um TERCEIRO opt-in, acima da leitura e da escrita: ele cria e
// altera uma página real. Reaproveita sempre a mesma tarefa descartável, então repetir
// a validação não acumula lixo no workspace.
const HARNESS_TITLE = '[hibi-harness] disposable validation task'

export function readNotionLifecycleConfig(environment = process.env) {
  if (environment.HIBI_LIVE_NOTION_LIFECYCLE !== '1') return null
  if (environment.HIBI_LIVE_CONNECTOR_ID !== 'notion') throw new Error('The Notion lifecycle requires HIBI_LIVE_CONNECTOR_ID=notion.')
  if (environment.HIBI_LIVE_CONNECTOR_WRITE_TEST !== '1') throw new Error('The Notion lifecycle writes to the workspace: set HIBI_LIVE_CONNECTOR_WRITE_TEST=1 as a separate opt-in.')
  const dataSourceId = environment.HIBI_LIVE_NOTION_DATA_SOURCE
  if (!bounded(dataSourceId, 240)) throw new Error('The Notion lifecycle requires HIBI_LIVE_NOTION_DATA_SOURCE.')
  return { dataSourceId }
}

const harnessTask = (durationMinutes, overrides = {}) => ({ id: 'harness-fixture', title: HARNESS_TITLE, durationMinutes, category: 'work', status: 'open', ...overrides })

// create -> read -> update -> conflito, contra o serviço real. O conflito não é simulado:
// a revisão remota muda porque a etapa anterior realmente editou a página no Notion.
export async function runNotionLifecycle(manager, connectorId, dataSourceId) {
  const readRecords = async () => (await manager.listImportCandidates(connectorId, { targets: [{ id: dataSourceId }] }))
    .map(notionRecordFromCandidate)
    .filter((record) => record !== null)

  // Escreve pelo mesmo `notion.sync.batch` que a interface envia, para o harness validar
  // o caminho real do app e não um atalho que só existe aqui.
  const write = async (kind, payload) => {
    const prepared = await manager.prepareAction({ connectorId, kind: 'notion.sync.batch', payload: { operations: [{ key: 'harness', kind, payload }] } })
    const result = await manager.executeApproved({ actionId: prepared.id, confirmationId: prepared.confirmationId })
    const item = (result.items ?? [])[0] ?? {}
    return { ok: result.ok === true && item.ok === true, remoteId: item.remoteId }
  }

  const steps = {}
  let records = await readRecords()
  let fixture = records.find((record) => record.title === HARNESS_TITLE)
  steps.reusedExistingFixture = Boolean(fixture)

  if (!fixture) {
    const created = await write('notion.page.create', { dataSourceId, task: harnessTask(30) })
    steps.create = { ok: created.ok === true, receivedRemoteId: typeof created.remoteId === 'string' }
    if (!steps.create.ok) return { ...steps, outcome: 'create_failed' }
    records = await readRecords()
    fixture = records.find((record) => record.title === HARNESS_TITLE)
  }
  if (!fixture) return { ...steps, outcome: 'fixture_not_readable' }

  steps.read = { mappedTitle: fixture.title === HARNESS_TITLE, hasRevision: Boolean(fixture.revision), hasDuration: fixture.durationMinutes !== undefined }

  // Estado no último sync, antes da alteração remota desta rodada.
  const baselineDuration = fixture.durationMinutes ?? 30
  const baselineRevision = fixture.revision
  const nextDuration = baselineDuration === 45 ? 30 : 45

  const updated = await write('notion.page.update', { id: fixture.remoteId, task: harnessTask(nextDuration) })
  steps.update = { ok: updated.ok === true }
  if (!steps.update.ok) return { ...steps, outcome: 'update_failed' }

  records = await readRecords()
  const after = records.find((record) => record.remoteId === fixture.remoteId)
  if (!after) return { ...steps, outcome: 'update_not_readable' }
  steps.updateVisible = { durationApplied: after.durationMinutes === nextDuration, revisionChanged: after.revision !== baselineRevision }

  // Conflito real: o remoto mudou acima; aqui o local também muda desde o mesmo checkpoint.
  const atLastSync = harnessTask(baselineDuration, { remoteRef: { connectorId: 'notion', remoteId: fixture.remoteId, revision: baselineRevision } })
  const editedLocally = harnessTask(baselineDuration + 5, { remoteRef: { connectorId: 'notion', remoteId: fixture.remoteId, revision: baselineRevision } })
  const checkpoint = { localId: 'harness-fixture', remoteId: fixture.remoteId, localHash: notionTaskHash(atLastSync), remoteRevision: baselineRevision }
  const plan = buildNotionSyncPlan([editedLocally], [after], [checkpoint])
  const item = plan.items.find((entry) => entry.localId === 'harness-fixture')
  steps.conflict = {
    detected: item?.state === 'conflict',
    defaultDecision: item ? defaultDecisionFor(item) : null,
    writesNothingByDefault: item ? defaultDecisionFor(item) === 'skip' : false,
  }

  const checks = [steps.read.mappedTitle, steps.read.hasRevision, steps.updateVisible.durationApplied, steps.updateVisible.revisionChanged, steps.conflict.detected, steps.conflict.writesNothingByDefault]
  return { ...steps, outcome: checks.every(Boolean) ? 'passed' : 'failed' }
}

export async function runLiveConnectorTest(environment = process.env, fetch = globalThis.fetch) {
  const safe = readLiveConnectorConfig(environment)
  const connector = FACTORIES[safe.connectorId]({ baseUrl: safe.endpoint })
  const manager = createIntegrationManager({ connectors: [connector], keychain: inMemoryKeychain(safe.connectorId, environment.HIBI_LIVE_CONNECTOR_TOKEN), fetch })

  // Nenhum título, corpo ou identificador remoto entra no relatório: só contagens,
  // resultados e o host já autorizado explicitamente.
  const report = { connectorId: safe.connectorId, endpointHost: safe.host, connection: null, importTargets: null, importRead: null, write: { attempted: false } }

  const connection = await manager.testConnection(safe.connectorId)
  report.connection = { ok: connection.ok }
  if (!connection.ok) return report

  if (typeof connector.listImportTargets === 'function') {
    try { report.importTargets = { count: (await manager.listImportTargets(safe.connectorId)).length } }
    catch { report.importTargets = { error: 'listing_failed' } }
  }

  if (typeof connector.fetchImports === 'function') {
    try {
      const candidates = await manager.listImportCandidates(safe.connectorId, { targets: safe.targets })
      report.importRead = { count: candidates.length, kinds: [...new Set(candidates.map((candidate) => candidate.kind))].sort(), withRevision: candidates.filter((candidate) => candidate.revision !== undefined).length }
    } catch { report.importRead = { error: 'read_failed' } }
  }

  if (safe.write) {
    const prepared = await manager.prepareAction({ connectorId: safe.connectorId, kind: safe.write.kind, payload: safe.write.payload })
    const result = await manager.executeApproved({ actionId: prepared.id, confirmationId: prepared.confirmationId })
    report.write = { attempted: true, kind: safe.write.kind, ok: result.ok === true, ...(typeof result.status === 'number' ? { status: result.status } : {}), receivedRemoteId: typeof result.remoteId === 'string' }
  }

  const lifecycle = readNotionLifecycleConfig(environment)
  if (lifecycle) report.notionLifecycle = await runNotionLifecycle(manager, safe.connectorId, lifecycle.dataSourceId)

  report.audit = (await manager.audit()).map(({ at, action, connectorId }) => ({ at, action, connectorId }))
  return report
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try { console.log(JSON.stringify(await runLiveConnectorTest(), null, 2)) }
  catch (error) { console.error(error instanceof Error ? error.message : 'Live connector test failed.'); process.exitCode = 1 }
}

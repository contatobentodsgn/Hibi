import { createIntegrationManager } from '../electron/integrations.cjs'
import { createNotionConnector } from '../electron/connectors/notion.cjs'
import { createSlackConnector } from '../electron/connectors/slack.cjs'
import { createEmailConnector } from '../electron/connectors/email.cjs'
import { createRemoteNotificationConnector } from '../electron/connectors/remote-notifications.cjs'

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
  if (environment.HIBI_LIVE_CONNECTOR_WRITE_TEST === '1') {
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

export async function runLiveConnectorTest(environment = process.env, fetch = globalThis.fetch) {
  const safe = readLiveConnectorConfig(environment)
  const connector = FACTORIES[safe.connectorId]({ baseUrl: safe.endpoint })
  const manager = createIntegrationManager({ connectors: [connector], keychain: inMemoryKeychain(safe.connectorId, environment.HIBI_LIVE_CONNECTOR_TOKEN), fetch })

  // Nenhum título, corpo ou identificador remoto entra no relatório: só contagens,
  // resultados e o host já autorizado explicitamente.
  const report = { connectorId: safe.connectorId, endpointHost: safe.host, connection: null, importTargets: null, importRead: null, write: { attempted: false } }

  const connection = await manager.testConnection(safe.connectorId)
  report.connection = { ok: connection.ok, detail: connection.detail }
  if (!connection.ok) return report

  if (typeof connector.listImportTargets === 'function') {
    try { report.importTargets = { count: (await manager.listImportTargets(safe.connectorId)).length } }
    catch (error) { report.importTargets = { error: error instanceof Error ? error.message : 'Listing import targets failed.' } }
  }

  if (typeof connector.fetchImports === 'function') {
    try {
      const candidates = await manager.listImportCandidates(safe.connectorId, { targets: safe.targets })
      report.importRead = { count: candidates.length, kinds: [...new Set(candidates.map((candidate) => candidate.kind))].sort(), withRevision: candidates.filter((candidate) => candidate.revision !== undefined).length }
    } catch (error) { report.importRead = { error: error instanceof Error ? error.message : 'Reading import candidates failed.' } }
  }

  if (safe.write) {
    const prepared = await manager.prepareAction({ connectorId: safe.connectorId, kind: safe.write.kind, payload: safe.write.payload })
    const result = await manager.executeApproved({ actionId: prepared.id, confirmationId: prepared.confirmationId })
    report.write = { attempted: true, kind: safe.write.kind, ok: result.ok === true, ...(typeof result.status === 'number' ? { status: result.status } : {}), receivedRemoteId: typeof result.remoteId === 'string' }
  }

  report.audit = (await manager.audit()).map(({ at, action, connectorId, detail }) => ({ at, action, connectorId, detail }))
  return report
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try { console.log(JSON.stringify(await runLiveConnectorTest(), null, 2)) }
  catch (error) { console.error(error instanceof Error ? error.message : 'Live connector test failed.'); process.exitCode = 1 }
}

import { createMainAiRuntime } from '../electron/ai-runtime.cjs'

const bounded = (value, maximum) => typeof value === 'string' && value.trim() && value.length <= maximum

export function readLiveProviderConfig(environment = process.env) {
  if (environment.PIXANO_LIVE_PROVIDER_TEST !== '1') throw new Error('Set PIXANO_LIVE_PROVIDER_TEST=1 to permit a real provider test.')
  const endpoint = environment.PIXANO_LIVE_PROVIDER_ENDPOINT
  const model = environment.PIXANO_LIVE_PROVIDER_MODEL
  const apiKey = environment.PIXANO_LIVE_PROVIDER_KEY
  const allowed = (environment.PIXANO_LIVE_PROVIDER_ALLOW_HOSTS ?? '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)
  if (!bounded(endpoint, 2_048) || !bounded(model, 240) || !bounded(apiKey, 8_192) || allowed.length === 0) throw new Error('Live provider test requires endpoint, model, key, and allowlisted host.')
  let url
  try { url = new URL(endpoint) } catch { throw new Error('Live provider endpoint is invalid.') }
  if (url.protocol !== 'https:' || !allowed.includes(url.hostname.toLowerCase())) throw new Error('Live provider endpoint is not on the explicit HTTPS allowlist.')
  return { endpoint: url.toString(), host: url.hostname.toLowerCase(), model }
}

const PROMPT = 'Reply with a valid Hibi JSON proposal and no tool calls.'
const turnFor = (message) => ({ message, locale: 'en-US', currentTime: new Date().toISOString(), surface: 'desktop', allowedTools: [], contextEvidence: [], recentTranscript: [] })

// O código vem do evento `failed`, o mesmo canal que a interface consome. A mensagem do erro é só
// último recurso: ela é texto de apresentação e pode mudar sem aviso.
const failureCode = (events, error) => {
  const failed = [...events].reverse().find((event) => event?.type === 'failed')
  if (failed?.failure?.code) return failed.failure.code
  return /failed: ([a-z_]+)\./.exec(error?.message ?? '')?.[1] ?? 'unknown'
}

// `overrides` injeta fetch, sleep e temporizador para o teste, e `cancelAfterMs` transforma a
// rodada num exercício de cancelamento. Numa validação ao vivo os dois primeiros ficam vazios.
export async function runLiveProviderTest(environment = process.env, overrides = {}) {
  const { cancelAfterMs, ...runtimeOverrides } = overrides
  const safe = readLiveProviderConfig(environment)
  const runtime = createMainAiRuntime({ config: { endpoint: safe.endpoint, model: safe.model, apiKey: environment.PIXANO_LIVE_PROVIDER_KEY }, ...runtimeOverrides })
  const events = []
  const onEvent = (event) => events.push(event)
  const report = (extra) => ({ endpointHost: safe.host, model: safe.model, provider: null, eventTypes: events.map((event) => event.type), usage: null, cancelled: false, ...extra })
  const completed = (response) => report({ model: response.model, provider: response.providerLabel, usage: response.usage ?? null })
  if (cancelAfterMs === undefined) return completed(await runtime.run(turnFor(PROMPT), { onEvent }))
  const timer = setTimeout(() => runtime.cancel(), cancelAfterMs)
  try { return completed(await runtime.run(turnFor(PROMPT), { onEvent })) }
  catch (error) { return report({ cancelled: failureCode(events, error) === 'cancelled' }) }
  finally { clearTimeout(timer) }
}

// 401, limite de uso e indisponibilidade não podem ser forçados contra um provedor real sem sujar a
// conta. Aqui as respostas são injetadas e o relatório carimba `simulated`, para ninguém ler estes
// três como validação ao vivo.
export async function runProviderFailureChecks(overrides = {}) {
  const runtime = createMainAiRuntime({ config: { endpoint: 'https://simulated.invalid/v1/chat/completions', model: 'simulated', apiKey: 'simulated' }, ...overrides })
  const probe = async () => {
    const events = []
    try { await runtime.run(turnFor('Probe.'), { onEvent: (event) => events.push(event) }); return { code: 'none', retries: 0 } }
    catch (error) { return { code: failureCode(events, error), retries: events.filter((event) => event?.type === 'retrying').length } }
  }
  const credentials = await probe()
  const limit = await probe()
  const outage = await probe()
  return { simulated: true, invalidCredentials: credentials.code, rateLimited: limit.code, unavailable: outage.code, retried: limit.retries + outage.retries }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    const live = await runLiveProviderTest()
    const cancellation = await runLiveProviderTest(process.env, { cancelAfterMs: 50 })
    console.log(JSON.stringify({ live, cancellation: { cancelled: cancellation.cancelled, eventTypes: cancellation.eventTypes } }, null, 2))
  }
  catch (error) { console.error(error instanceof Error ? error.message : 'Live provider test failed.'); process.exitCode = 1 }
}

import { createMainAiRuntime } from '../electron/ai-runtime.cjs'

const bounded = (value, maximum) => typeof value === 'string' && value.trim() && value.length <= maximum

export function readLiveProviderConfig(environment = process.env) {
  if (environment.HIBI_LIVE_PROVIDER_TEST !== '1') throw new Error('Set HIBI_LIVE_PROVIDER_TEST=1 to permit a real provider test.')
  const endpoint = environment.HIBI_LIVE_PROVIDER_ENDPOINT
  const model = environment.HIBI_LIVE_PROVIDER_MODEL
  const apiKey = environment.HIBI_LIVE_PROVIDER_KEY
  const allowed = (environment.HIBI_LIVE_PROVIDER_ALLOW_HOSTS ?? '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)
  if (!bounded(endpoint, 2_048) || !bounded(model, 240) || !bounded(apiKey, 8_192) || allowed.length === 0) throw new Error('Live provider test requires endpoint, model, key, and allowlisted host.')
  let url
  try { url = new URL(endpoint) } catch { throw new Error('Live provider endpoint is invalid.') }
  if (url.protocol !== 'https:' || !allowed.includes(url.hostname.toLowerCase())) throw new Error('Live provider endpoint is not on the explicit HTTPS allowlist.')
  return { endpoint: url.toString(), host: url.hostname.toLowerCase(), model }
}

export async function runLiveProviderTest(environment = process.env) {
  const safe = readLiveProviderConfig(environment)
  const runtime = createMainAiRuntime({ config: { endpoint: safe.endpoint, model: safe.model, apiKey: environment.HIBI_LIVE_PROVIDER_KEY } })
  const events = []
  const response = await runtime.run({ message: 'Reply with a valid Hibi JSON proposal and no tool calls.', locale: 'en-US', currentTime: new Date().toISOString(), surface: 'desktop', allowedTools: [], contextEvidence: [], recentTranscript: [] }, undefined, (event) => events.push(event.type))
  return { endpointHost: safe.host, model: response.model, provider: response.providerLabel, eventTypes: events, usage: response.usage ?? null, cancelled: false }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try { console.log(JSON.stringify(await runLiveProviderTest(), null, 2)) }
  catch (error) { console.error(error instanceof Error ? error.message : 'Live provider test failed.'); process.exitCode = 1 }
}

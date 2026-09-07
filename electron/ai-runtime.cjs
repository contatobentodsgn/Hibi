const MAX_BODY_BYTES = 1024 * 1024;
const TURN_LIMIT = 8000;

function safeEndpoint(raw) {
  const url = new URL(raw);
  const loopback = url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (!loopback && url.protocol !== 'https:') throw new Error('AI endpoint must use HTTPS or local loopback HTTP.');
  return url;
}

function redactedError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [redacted]').replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]');
}

function validateTurn(value) {
  if (!value || typeof value !== 'object') throw new Error('Invalid AI turn.');
  const candidate = value.request && typeof value.request === 'object' ? value.request : value;
  const message = candidate.message;
  const surface = candidate.surface;
  if (typeof message !== 'string' || !message.trim() || message.length > TURN_LIMIT) throw new Error('Invalid AI message.');
  if (surface !== 'desktop' && surface !== 'notch') throw new Error('Invalid AI surface.');
  const serialized = JSON.stringify(candidate);
  if (Buffer.byteLength(serialized, 'utf8') > 64 * 1024) throw new Error('AI turn exceeds the 64 KiB limit.');
  return { ...candidate, message: message.trim(), surface };
}

function createOpenAiCompatibleClient({ endpoint, apiKey, model, fetchImpl = fetch, timeoutMs = 30_000 }) {
  const url = safeEndpoint(endpoint);
  const requestCompletion = async (messages, signal) => {
    const timeout = AbortSignal.timeout(timeoutMs);
    const controller = new AbortController();
    const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true }); timeout.addEventListener('abort', abort, { once: true });
    try {
      const response = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, messages, response_format: { type: 'json_object' } }), signal: controller.signal });
      if (!response.ok) throw new Error(`Provider request failed (${response.status}).`);
      const length = Number(response.headers?.get?.('content-length') ?? 0);
      if (length > MAX_BODY_BYTES) throw new Error('Provider response exceeds the 1 MiB limit.');
      const text = await response.text();
      if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) throw new Error('Provider response exceeds the 1 MiB limit.');
      const parsed = JSON.parse(text);
      const content = parsed?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.length > MAX_BODY_BYTES) throw new Error('Provider returned an invalid response.');
      return content;
    } catch (error) { throw new Error(redactedError(error)); }
    finally { signal?.removeEventListener('abort', abort); }
  };
  return {
    async generate(turn, signal) {
      const contract = JSON.stringify({ allowedTools: turn.allowedTools ?? [], contextEvidence: turn.contextEvidence ?? [], currentTime: turn.currentTime, surface: turn.surface });
      const content = await requestCompletion([{ role: 'system', content: `Return only a JSON object with reply, toolCalls, and notchPresentation. You may use only these tool schemas and context: ${contract}` }, { role: 'user', content: turn.message }], signal);
      return { content: content.slice(0, TURN_LIMIT), providerLabel: 'OpenAI-compatible', model };
    },
    async testConnection(signal) { await requestCompletion([{ role: 'user', content: 'Connection test. Reply with a compact JSON object.' }], signal); },
  };
}

function createMainAiRuntime({ config = {}, fetchImpl } = {}) {
  let active = null;
  const client = config.endpoint && config.apiKey && config.model ? createOpenAiCompatibleClient({ ...config, fetchImpl }) : null;
  return {
    async run(raw) {
      const turn = validateTurn(raw); active?.abort(); const controller = new AbortController(); active = controller;
      try {
        if (client) return await client.generate(turn, controller.signal);
        return { content: JSON.stringify({ reply: 'I can help with your local tasks, schedule, notes, and reminders.', toolCalls: [], notchPresentation: null }), providerLabel: 'Hibi local heuristic', model: 'local-tool-provider' };
      } finally { if (active === controller) active = null; }
    },
    async testConnection() { if (!client) return; await client.testConnection(); },
    cancel() { active?.abort(); },
  };
}

module.exports = { MAX_BODY_BYTES, safeEndpoint, redactedError, validateTurn, createOpenAiCompatibleClient, createMainAiRuntime };

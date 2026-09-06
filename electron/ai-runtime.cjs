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
  const message = value.message;
  const surface = value.surface;
  if (typeof message !== 'string' || !message.trim() || message.length > TURN_LIMIT) throw new Error('Invalid AI message.');
  if (surface !== 'desktop' && surface !== 'notch') throw new Error('Invalid AI surface.');
  return { message: message.trim(), surface };
}

function createOpenAiCompatibleClient({ endpoint, apiKey, model, fetchImpl = fetch, timeoutMs = 30_000 }) {
  const url = safeEndpoint(endpoint);
  return {
    async generate(turn, signal) {
      const timeout = AbortSignal.timeout(timeoutMs);
      const controller = new AbortController();
      const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true }); timeout.addEventListener('abort', abort, { once: true });
      try {
        const response = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, messages: [{ role: 'user', content: turn.message }], response_format: { type: 'json_object' } }), signal: controller.signal });
        if (!response.ok) throw new Error(`Provider request failed (${response.status}).`);
        const length = Number(response.headers?.get?.('content-length') ?? 0);
        if (length > MAX_BODY_BYTES) throw new Error('Provider response exceeds the 1 MiB limit.');
        const text = await response.text();
        if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) throw new Error('Provider response exceeds the 1 MiB limit.');
        const parsed = JSON.parse(text);
        const content = parsed?.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || content.length > MAX_BODY_BYTES) throw new Error('Provider returned an invalid response.');
        return { reply: content.slice(0, TURN_LIMIT), providerLabel: model };
      } catch (error) { throw new Error(redactedError(error)); }
      finally { signal?.removeEventListener('abort', abort); }
    },
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
        return { reply: 'I can help with your local tasks, schedule, notes, and reminders.', providerLabel: 'Hibi local heuristic' };
      } finally { if (active === controller) active = null; }
    },
    cancel() { active?.abort(); },
  };
}

module.exports = { MAX_BODY_BYTES, safeEndpoint, redactedError, validateTurn, createOpenAiCompatibleClient, createMainAiRuntime };

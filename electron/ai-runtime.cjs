const { randomUUID } = require('node:crypto');

const MAX_BODY_BYTES = 1024 * 1024;
const TURN_LIMIT = 8000;
const MAX_MODEL_LENGTH = 240;
const MAX_RETRY_AFTER_MS = 60_000;

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

function reportedModel(value, fallback) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_MODEL_LENGTH ? value : fallback;
}

function validateJsonContract(content) {
  let value;
  try { value = JSON.parse(content); } catch { throw new Error('Provider returned an invalid JSON contract.'); }
  if (!value || typeof value !== 'object' || typeof value.reply !== 'string' || !Array.isArray(value.toolCalls) || !Object.prototype.hasOwnProperty.call(value, 'notchPresentation')) throw new Error('Provider returned an invalid JSON contract.');
  return value;
}

function recordFrom(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

function finiteNonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function normalizeUsage(value) {
  const record = recordFrom(value);
  const first = (keys) => {
    for (const key of keys) {
      const candidate = finiteNonNegative(record?.[key]);
      if (candidate !== undefined) return candidate;
    }
    return 0;
  };
  const inputTokens = first(['input_tokens', 'prompt_tokens']);
  const outputTokens = first(['output_tokens', 'completion_tokens']);
  const estimatedCost = (() => {
    for (const key of ['estimatedCost', 'estimated_cost']) {
      const candidate = finiteNonNegative(record?.[key]);
      if (candidate !== undefined) return candidate;
    }
  })();
  return { inputTokens, outputTokens, totalTokens: Math.min(inputTokens + outputTokens, Number.MAX_VALUE), ...(estimatedCost === undefined ? {} : { estimatedCost }) };
}

function parseRetryAfter(value, nowMs = Date.now()) {
  const seconds = typeof value === 'number' ? value : typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value.trim()) : undefined;
  if (seconds !== undefined) return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, MAX_RETRY_AFTER_MS) : undefined;
  if (typeof value !== 'string' || !Number.isFinite(nowMs)) return undefined;
  const retryAtMs = Date.parse(value);
  return Number.isFinite(retryAtMs) && retryAtMs > nowMs ? Math.min(retryAtMs - nowMs, MAX_RETRY_AFTER_MS) : undefined;
}

function retryDelayFor(attempt) {
  const boundedAttempt = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 1;
  return Math.min(1000 * 2 ** Math.max(0, boundedAttempt - 1), 4000);
}

function classifyProviderFailure(input) {
  const record = recordFrom(input);
  const name = typeof record?.name === 'string' ? record.name.toLowerCase() : undefined;
  const code = typeof record?.code === 'string' ? record.code.toLowerCase() : undefined;
  const status = finiteNonNegative(record?.status) ?? finiteNonNegative(record?.statusCode) ?? finiteNonNegative(recordFrom(record?.response)?.status);
  if (name === 'aborterror' || code === 'abort_err' || code === 'aborted') return { code: 'cancelled', retryable: false };
  if (status === 401 || status === 403) return { code: 'invalid_credentials', retryable: false };
  if (status === 429) {
    const retryAfterMs = finiteNonNegative(record?.retryAfterMs);
    return { code: 'rate_limited', retryable: true, ...(retryAfterMs && retryAfterMs > 0 ? { retryAfterMs: Math.min(retryAfterMs, MAX_RETRY_AFTER_MS) } : {}) };
  }
  if (name === 'syntaxerror' || code === 'invalid_response' || record?.type === 'malformed_response') return { code: 'invalid_response', retryable: false };
  return { code: 'unavailable', retryable: true };
}

function providerError(response) {
  const error = new Error('Provider request failed.');
  error.status = response.status;
  const retryAfterMs = parseRetryAfter(response.headers?.get?.('retry-after'));
  if (retryAfterMs !== undefined) error.retryAfterMs = retryAfterMs;
  return error;
}

function invalidResponseError() {
  const error = new Error('Provider returned an invalid response.');
  error.code = 'invalid_response';
  error.safeMessage = 'Provider returned an invalid response.';
  return error;
}

function safeFailureError(failure, error) {
  return new Error(typeof error?.safeMessage === 'string' ? error.safeMessage : `AI provider request failed: ${failure.code}.`);
}

function cancellationError() {
  return Object.assign(new Error('AI request cancelled.'), { name: 'AbortError' });
}

async function waitForRetry(sleep, delayMs, signal) {
  if (!signal) return sleep(delayMs);
  if (signal.aborted) throw cancellationError();
  await new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(cancellationError()); };
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(sleep(delayMs)).then(() => { signal.removeEventListener('abort', abort); resolve(); }, (error) => { signal.removeEventListener('abort', abort); reject(error); });
  });
}

function createTimeout(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  return { signal: controller.signal, dispose: () => clearTimeout(timer) };
}

function isValidRequestId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && /^[A-Za-z0-9_-]+$/.test(value);
}

function createAiRequestCoordinator({ runtime, createRequestId = () => `ai-${randomUUID()}` }) {
  let active = null;
  return {
    async run(sender, turn, onEvent) {
      const requestId = createRequestId();
      if (!isValidRequestId(requestId)) throw new Error('Invalid AI request id.');
      const request = { sender, requestId };
      active = request;
      try {
        return await runtime.run(turn, {
          onEvent: (event) => {
            if (active === request && event && typeof event === 'object') onEvent({ ...event, requestId });
          },
        });
      } finally {
        if (active === request) active = null;
      }
    },
    cancel(sender) {
      if (!active || active.sender !== sender) return false;
      runtime.cancel();
      return true;
    },
  };
}

function createOpenAiCompatibleClient({ endpoint, apiKey, model, fetchImpl = fetch, timeoutMs = 30_000, timeoutFactory = createTimeout, onEvent, sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay)) }) {
  const url = safeEndpoint(endpoint);
  const requestCompletion = async (messages, signal, requestOnEvent, stream = true) => {
    const emit = typeof requestOnEvent === 'function' ? requestOnEvent : typeof onEvent === 'function' ? onEvent : () => {};
    let fetchCount = 0;
    let maxFetches = Infinity;
    let retryAttempt = 0;
    const noteFailure = (error) => {
      const failure = classifyProviderFailure(signal?.aborted ? { name: 'AbortError' } : error);
      const limit = failure.code === 'invalid_credentials' || failure.code === 'invalid_response' || failure.code === 'cancelled' ? 1 : failure.code === 'rate_limited' ? 2 : 3;
      maxFetches = Math.min(maxFetches, limit);
      return failure;
    };
    const request = async (streaming) => {
      if (fetchCount >= maxFetches) throw new Error('AI provider request budget exhausted.');
      const timeout = timeoutFactory(timeoutMs);
      if (!timeout?.signal || typeof timeout.signal.addEventListener !== 'function') throw new Error('Invalid AI timeout controller.');
      const controller = new AbortController();
      const abort = () => controller.abort();
      let timedOut = false;
      const abortForTimeout = () => { timedOut = true; controller.abort(); };
      signal?.addEventListener('abort', abort, { once: true });
      timeout.signal.addEventListener('abort', abortForTimeout, { once: true });
      fetchCount += 1;
      const dispose = () => {
        signal?.removeEventListener('abort', abort);
        timeout.signal.removeEventListener('abort', abortForTimeout);
        timeout.dispose?.();
      };
      try {
        const response = await fetchImpl(url, {
          method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, messages, response_format: { type: 'json_object' }, ...(streaming ? { stream: true, stream_options: { include_usage: true } } : {}) }), signal: controller.signal,
        });
        if (!response.ok) throw providerError(response);
        const length = Number(response.headers?.get?.('content-length') ?? 0);
        if (length > MAX_BODY_BYTES) {
          const error = invalidResponseError(); error.safeMessage = 'Provider response exceeds the 1 MiB limit.'; throw error;
        }
        return { response, timeout, dispose };
      } catch (error) {
        dispose();
        if (timedOut) throw Object.assign(new Error('Provider request timed out.'), { name: 'TimeoutError' });
        noteFailure(error);
        throw error;
      }
    };
    const parseJsonResponse = async (response) => {
      if (typeof response.text !== 'function') throw invalidResponseError();
      const text = await response.text();
      if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
        const error = invalidResponseError(); error.safeMessage = 'Provider response exceeds the 1 MiB limit.'; throw error;
      }
      let parsed;
      try { parsed = JSON.parse(text); } catch { throw invalidResponseError(); }
      const content = parsed?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.length > MAX_BODY_BYTES) throw invalidResponseError();
      return { content, model: reportedModel(parsed?.model, model) };
    };
    const parseStream = async (response, timeoutSignal) => {
      const reader = response.body?.getReader?.();
      if (!reader) return { fallbackResponse: response };
      let bodyBytes = 0; let buffer = ''; let content = ''; let sawEvent = false; let completed = false;
      const decoder = new TextDecoder();
      const cancelReader = () => { void Promise.resolve(reader.cancel()).catch(() => {}); };
      const abort = () => { cancelReader(); };
      signal?.addEventListener('abort', abort, { once: true });
      const consumeEvent = (block) => {
        const data = block.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
        if (!data) return;
        if (data === '[DONE]') { completed = true; emit({ type: 'completed' }); return; }
        let payload;
        try { payload = JSON.parse(data); } catch { throw invalidResponseError(); }
        sawEvent = true;
        const delta = payload?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta.length > 0) {
          content += delta;
          if (Buffer.byteLength(content, 'utf8') > MAX_BODY_BYTES) {
            const error = invalidResponseError(); error.safeMessage = 'Provider response exceeds the 1 MiB limit.'; throw error;
          }
          for (let start = 0; start < delta.length; start += TURN_LIMIT) emit({ type: 'delta', delta: delta.slice(start, start + TURN_LIMIT) });
        }
        if (payload?.usage !== undefined) emit({ type: 'usage', usage: normalizeUsage(payload.usage) });
      };
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bodyBytes += chunk.value?.byteLength ?? 0;
          if (bodyBytes > MAX_BODY_BYTES) {
            const error = invalidResponseError(); error.safeMessage = 'Provider response exceeds the 1 MiB limit.'; throw error;
          }
          buffer += decoder.decode(chunk.value, { stream: true });
          const blocks = buffer.split(/\r?\n\r?\n/); buffer = blocks.pop();
          for (const block of blocks) consumeEvent(block);
        }
        buffer += decoder.decode();
        if (buffer.trim()) consumeEvent(buffer);
        if (!sawEvent && !completed) return { fallbackResponse: response };
        if (!completed) emit({ type: 'completed' });
        return { content, model };
      } catch (error) {
        if (signal?.aborted) throw cancellationError();
        if (timeoutSignal?.aborted) throw Object.assign(new Error('Provider request timed out.'), { name: 'TimeoutError' });
        if (error?.code === 'invalid_response' && error?.safeMessage === 'Provider response exceeds the 1 MiB limit.') throw error;
        if (!sawEvent) return { fallback: true, error };
        throw error;
      } finally {
        signal?.removeEventListener('abort', abort);
        cancelReader();
      }
    };
    while (true) {
      if (signal?.aborted) throw cancellationError();
      try {
        const streamAttempt = await request(stream);
        const parseJsonAttempt = async (attempt) => {
          try { return await parseJsonResponse(attempt.response); }
          catch (error) {
            if (attempt.timeout.signal.aborted) throw Object.assign(new Error('Provider request timed out.'), { name: 'TimeoutError' });
            throw error;
          } finally { attempt.dispose(); }
        };
        if (!stream) return await parseJsonAttempt(streamAttempt);
        let parsed;
        try { parsed = await parseStream(streamAttempt.response, streamAttempt.timeout.signal); }
        catch (error) { streamAttempt.dispose(); throw error; }
        if (!parsed.fallback && !parsed.fallbackResponse) { streamAttempt.dispose(); return parsed; }
        if (parsed.fallbackResponse) return await parseJsonAttempt(streamAttempt);
        streamAttempt.dispose();
        if (parsed.error) noteFailure(parsed.error);
        if (fetchCount >= maxFetches) throw parsed.error ?? new Error('AI provider request budget exhausted.');
        if (signal?.aborted) throw cancellationError();
        return await parseJsonAttempt(await request(false));
      } catch (error) {
        const failure = noteFailure(error);
        if (failure.retryable && fetchCount < maxFetches) {
          retryAttempt += 1;
          const delayMs = failure.retryAfterMs ?? retryDelayFor(retryAttempt);
          emit({ type: 'retrying', attempt: retryAttempt, delayMs, failure });
          await waitForRetry(sleep, delayMs, signal);
          continue;
        }
        emit({ type: 'failed', failure });
        throw safeFailureError(failure, error);
      }
    }
  };
  return {
    async generate(turn, signal, requestOptions) {
      const contract = JSON.stringify({ allowedTools: turn.allowedTools ?? [], contextEvidence: turn.contextEvidence ?? [], currentTime: turn.currentTime, surface: turn.surface });
      const response = await requestCompletion([{ role: 'system', content: `Return only a JSON object with reply, toolCalls, and notchPresentation. You may use only these tool schemas and context: ${contract}` }, { role: 'user', content: turn.message }], signal, requestOptions?.onEvent);
      return { content: response.content.slice(0, TURN_LIMIT), providerLabel: 'OpenAI-compatible', model: response.model };
    },
    async testConnection(signal) { const response = await requestCompletion([{ role: 'user', content: 'Connection test. Reply with a compact JSON object with reply, toolCalls, and notchPresentation.' }], signal, undefined, false); validateJsonContract(response.content); },
  };
}

function createMainAiRuntime({ config = {}, fetchImpl, sleep, timeoutFactory } = {}) {
  let active = null;
  const client = config.endpoint && config.apiKey && config.model ? createOpenAiCompatibleClient({ ...config, fetchImpl, sleep, timeoutFactory }) : null;
  return {
    async run(raw, requestOptions) {
      const turn = validateTurn(raw); active?.abort(); const controller = new AbortController(); active = controller;
      try {
        if (client) return await client.generate(turn, controller.signal, requestOptions);
        return { content: JSON.stringify({ reply: 'I can help with your local tasks, schedule, notes, and reminders.', toolCalls: [], notchPresentation: null }), providerLabel: 'Hibi local heuristic', model: 'local-tool-provider' };
      } finally { if (active === controller) active = null; }
    },
    async testConnection() { if (!client) return; await client.testConnection(); },
    cancel() { active?.abort(); },
  };
}

module.exports = { MAX_BODY_BYTES, safeEndpoint, redactedError, validateTurn, validateJsonContract, normalizeUsage, parseRetryAfter, retryDelayFor, classifyProviderFailure, createAiRequestCoordinator, createOpenAiCompatibleClient, createMainAiRuntime };

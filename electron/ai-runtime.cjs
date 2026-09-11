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
  const reportedTotalTokens = finiteNonNegative(record?.total_tokens);
  const estimatedCost = (() => {
    for (const key of ['estimatedCost', 'estimated_cost']) {
      const candidate = finiteNonNegative(record?.[key]);
      if (candidate !== undefined) return candidate;
    }
  })();
  return { inputTokens, outputTokens, totalTokens: reportedTotalTokens ?? Math.min(inputTokens + outputTokens, Number.MAX_VALUE), ...(estimatedCost === undefined ? {} : { estimatedCost }) };
}

function parseRetryAfter(value, nowMs = Date.now()) {
  const seconds = typeof value === 'number' ? value : typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value.trim()) : undefined;
  if (seconds !== undefined) return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, MAX_RETRY_AFTER_MS) : undefined;
  if (typeof value !== 'string' || !Number.isFinite(nowMs)) return undefined;
  const retryAtMs = Date.parse(value);
  return Number.isFinite(retryAtMs) && retryAtMs > nowMs ? Math.min(retryAtMs - nowMs, MAX_RETRY_AFTER_MS) : undefined;
}

function retryDelayFor(attempt, random = Math.random) {
  const boundedAttempt = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 1;
  const capMs = Math.min(1000 * 2 ** Math.max(0, boundedAttempt - 1), 4000);
  const sample = typeof random === 'function' ? random() : 0.5;
  const jitter = Number.isFinite(sample) ? Math.min(Math.max(sample, 0), 1) : 0.5;
  return Math.round(capMs * (0.5 + jitter * 0.5));
}

function classifyProviderFailure(input) {
  const record = recordFrom(input);
  const name = typeof record?.name === 'string' ? record.name.toLowerCase() : undefined;
  const code = typeof record?.code === 'string' ? record.code.toLowerCase() : undefined;
  const status = finiteNonNegative(record?.status) ?? finiteNonNegative(record?.statusCode) ?? finiteNonNegative(recordFrom(record?.response)?.status);
  if (name === 'aborterror' || code === 'abort_err' || code === 'aborted') return { code: 'cancelled', retryable: false };
  if (code === 'incomplete_stream') return { code: 'unavailable', retryable: false };
  if (status === 401 || status === 403) return { code: 'invalid_credentials', retryable: false };
  if (status === 429) {
    const retryAfterMs = finiteNonNegative(record?.retryAfterMs);
    return { code: 'rate_limited', retryable: true, ...(retryAfterMs && retryAfterMs > 0 ? { retryAfterMs: Math.min(retryAfterMs, MAX_RETRY_AFTER_MS) } : {}) };
  }
  if (status === 408) return { code: 'unavailable', retryable: true };
  // Um marcador explícito de resposta ilegível vale mais que a faixa de status.
  if (name === 'syntaxerror' || code === 'invalid_response' || record?.type === 'malformed_response') return { code: 'invalid_response', retryable: false };
  // O 4xx restante é a requisição — endpoint, id de modelo ou forma do pedido —, não a resposta.
  // Nenhum deles passa a funcionar ao repetir, então a faixa inteira fica não-retentável.
  if (status >= 400 && status < 500) return { code: 'invalid_request', retryable: false };
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
  if (!signal) return typeof sleep === 'function' ? sleep(delayMs) : new Promise((resolve) => setTimeout(resolve, delayMs));
  if (signal.aborted) throw cancellationError();
  await new Promise((resolve, reject) => {
    let timer;
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      callback(value);
    };
    const abort = () => {
      if (timer !== undefined) clearTimeout(timer);
      finish(reject, cancellationError());
    };
    signal.addEventListener('abort', abort, { once: true });
    if (typeof sleep === 'function') {
      try { Promise.resolve(sleep(delayMs)).then(() => finish(resolve), (error) => finish(reject, error)); }
      catch (error) { finish(reject, error); }
    } else {
      timer = setTimeout(() => finish(resolve), delayMs);
      timer.unref?.();
    }
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

function attachAiRequestSenderLifecycle(sender, onDestroyed) {
  if (!sender?.once || typeof onDestroyed !== 'function') return () => {};
  let attached = true;
  const destroyed = () => {
    if (!attached) return;
    attached = false;
    onDestroyed();
  };
  sender.once('destroyed', destroyed);
  return () => {
    if (!attached) return;
    attached = false;
    sender.removeListener?.('destroyed', destroyed);
  };
}

function createAiRequestCoordinator({ runtime, createRequestId = () => `ai-${randomUUID()}` }) {
  let active = null;
  const clear = (request) => {
    if (active !== request) return;
    request.detach?.();
    active = null;
  };
  return {
    async run(sender, turn, correlationId, onEvent) {
      if (active && active.sender !== sender) throw new Error('An AI request is already active.');
      const requestId = createRequestId();
      if (!isValidRequestId(requestId)) throw new Error('Invalid AI request id.');
      if (correlationId !== undefined && !isValidRequestId(correlationId)) throw new Error('Invalid AI correlation id.');
      const request = { sender, requestId, correlationId };
      active?.detach?.();
      active = request;
      request.detach = attachAiRequestSenderLifecycle(sender, () => {
        if (active !== request) return;
        runtime.cancel();
        clear(request);
      });
      try {
        const scopedEvent = (event) => ({ ...event, requestId, ...(correlationId === undefined ? {} : { correlationId }) });
        onEvent(scopedEvent({ type: 'started' }));
        const result = await runtime.run(turn, {
          onEvent: (event) => {
            if (active === request && event && typeof event === 'object') onEvent(scopedEvent(event));
          },
        });
        return { ...result, requestId, ...(correlationId === undefined ? {} : { correlationId }) };
      } finally {
        clear(request);
      }
    },
    cancel(sender, requestId, correlationId) {
      if (!active || active.sender !== sender) return false;
      if (requestId !== undefined && active.requestId !== requestId) return false;
      if (correlationId !== undefined && active.correlationId !== correlationId) return false;
      if (requestId === undefined && correlationId === undefined) return false;
      runtime.cancel();
      return true;
    },
    dispose() {
      if (!active) return false;
      const request = active;
      runtime.cancel();
      clear(request);
      return true;
    },
  };
}

function replaceAiRequestCoordinator(previous, runtime, createCoordinator = createAiRequestCoordinator) {
  previous?.dispose?.();
  return createCoordinator({ runtime });
}

function createOpenAiCompatibleClient({ endpoint, apiKey, model, fetchImpl = fetch, timeoutMs = 30_000, timeoutFactory = createTimeout, onEvent, sleep, random = Math.random }) {
  const url = safeEndpoint(endpoint);
  const requestCompletion = async (messages, signal, requestOnEvent, stream = true) => {
    const emit = typeof requestOnEvent === 'function' ? requestOnEvent : typeof onEvent === 'function' ? onEvent : () => {};
    const emitContentDeltas = (content) => {
      for (let start = 0; start < content.length; start += TURN_LIMIT) emit({ type: 'delta', delta: content.slice(start, start + TURN_LIMIT) });
    };
    const emitFallbackContent = (content) => {
      emitContentDeltas(content);
      emit({ type: 'completed' });
    };
    let fetchCount = 0;
    let maxFetches = Infinity;
    let retryAttempt = 0;
    const noteFailure = (error) => {
      const failure = classifyProviderFailure(signal?.aborted ? { name: 'AbortError' } : error);
      const limit = failure.code === 'invalid_credentials' || failure.code === 'invalid_request' || failure.code === 'invalid_response' || failure.code === 'cancelled' ? 1 : failure.code === 'rate_limited' ? 2 : 3;
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
    const parseJsonResponse = async (response, fallbackText) => {
      if (fallbackText === undefined && typeof response.text !== 'function') throw invalidResponseError();
      const text = fallbackText ?? await response.text();
      if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
        const error = invalidResponseError(); error.safeMessage = 'Provider response exceeds the 1 MiB limit.'; throw error;
      }
      let parsed;
      try { parsed = JSON.parse(text); } catch { throw invalidResponseError(); }
      const content = parsed?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.length > MAX_BODY_BYTES) throw invalidResponseError();
      return { content, model: reportedModel(parsed?.model, model), ...(parsed?.usage === undefined ? {} : { usage: normalizeUsage(parsed.usage) }) };
    };
    const parseStream = async (response, timeoutSignal) => {
      const reader = response.body?.getReader?.();
      if (!reader) return { fallbackResponse: response };
      let bodyBytes = 0; let buffer = ''; let bodyText = ''; let content = ''; let sawEvent = false; let completed = false; let emittedDelta = false; let streamedModel = model; let streamedUsage;
      const decoder = new TextDecoder();
      let readerCancelled = false;
      const cancelReader = () => {
        if (readerCancelled) return;
        readerCancelled = true;
        void Promise.resolve(reader.cancel()).catch(() => {});
      };
      const abort = () => { cancelReader(); };
      signal?.addEventListener('abort', abort, { once: true });
      const consumeEvent = (block) => {
        if (completed) return;
        const data = block.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
        if (!data) return;
        if (data === '[DONE]') { completed = true; emit({ type: 'completed' }); cancelReader(); return; }
        let payload;
        try { payload = JSON.parse(data); } catch { throw invalidResponseError(); }
        sawEvent = true;
        streamedModel = reportedModel(payload?.model, streamedModel);
        const delta = payload?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta.length > 0) {
          content += delta;
          if (Buffer.byteLength(content, 'utf8') > MAX_BODY_BYTES) {
            const error = invalidResponseError(); error.safeMessage = 'Provider response exceeds the 1 MiB limit.'; throw error;
          }
          emittedDelta = true;
          emitContentDeltas(delta);
        }
        if (payload?.usage !== undefined) { streamedUsage = normalizeUsage(payload.usage); emit({ type: 'usage', usage: streamedUsage }); }
      };
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bodyBytes += chunk.value?.byteLength ?? 0;
          if (bodyBytes > MAX_BODY_BYTES) {
            const error = invalidResponseError(); error.safeMessage = 'Provider response exceeds the 1 MiB limit.'; throw error;
          }
          const decoded = decoder.decode(chunk.value, { stream: true });
          bodyText += decoded;
          buffer += decoded;
          const blocks = buffer.split(/\r?\n\r?\n/); buffer = blocks.pop();
          for (const block of blocks) {
            consumeEvent(block);
            if (completed) return { content, model: streamedModel, ...(streamedUsage === undefined ? {} : { usage: streamedUsage }) };
          }
        }
        const decoded = decoder.decode();
        bodyText += decoded;
        buffer += decoded;
        if (buffer.trim()) consumeEvent(buffer);
        if (completed) return { content, model: streamedModel, ...(streamedUsage === undefined ? {} : { usage: streamedUsage }) };
        if (!sawEvent && !completed) return { fallbackText: bodyText };
        if (!completed) {
          const error = new Error('Provider stream ended before [DONE].');
          if (emittedDelta) error.code = 'incomplete_stream';
          throw error;
        }
        return { content, model: streamedModel, ...(streamedUsage === undefined ? {} : { usage: streamedUsage }) };
      } catch (error) {
        if (signal?.aborted) throw cancellationError();
        if (emittedDelta && !completed) {
          const interrupted = new Error('Provider stream interrupted after visible output.');
          interrupted.code = 'incomplete_stream';
          throw interrupted;
        }
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
        const parseJsonAttempt = async (attempt, fallbackText) => {
          try { return await parseJsonResponse(attempt.response, fallbackText); }
          catch (error) {
            if (attempt.timeout.signal.aborted) throw Object.assign(new Error('Provider request timed out.'), { name: 'TimeoutError' });
            throw error;
          } finally { attempt.dispose(); }
        };
        if (!stream) return await parseJsonAttempt(streamAttempt);
        let parsed;
        try { parsed = await parseStream(streamAttempt.response, streamAttempt.timeout.signal); }
        catch (error) { streamAttempt.dispose(); throw error; }
        if (!parsed.fallback && !parsed.fallbackResponse && parsed.fallbackText === undefined) { streamAttempt.dispose(); return parsed; }
        if (parsed.fallbackText !== undefined) {
          const fallback = await parseJsonAttempt(streamAttempt, parsed.fallbackText);
          emitFallbackContent(fallback.content);
          return fallback;
        }
        if (parsed.fallbackResponse) {
          const fallback = await parseJsonAttempt(streamAttempt);
          emitFallbackContent(fallback.content);
          return fallback;
        }
        streamAttempt.dispose();
        if (parsed.error) noteFailure(parsed.error);
        if (fetchCount >= maxFetches) throw parsed.error ?? new Error('AI provider request budget exhausted.');
        if (signal?.aborted) throw cancellationError();
        const fallback = await parseJsonAttempt(await request(false));
        emitFallbackContent(fallback.content);
        return fallback;
      } catch (error) {
        const failure = noteFailure(error);
        if (failure.retryable && fetchCount < maxFetches) {
          retryAttempt += 1;
          const delayMs = failure.retryAfterMs ?? retryDelayFor(retryAttempt, random);
          emit({ type: 'retrying', attempt: retryAttempt, delayMs, failure });
          try { await waitForRetry(sleep, delayMs, signal); }
          catch (retryError) {
            const retryFailure = noteFailure(retryError);
            emit({ type: 'failed', failure: retryFailure });
            throw safeFailureError(retryFailure, retryError);
          }
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
      return { content: response.content.slice(0, TURN_LIMIT), providerLabel: 'OpenAI-compatible', model: response.model, ...(response.usage === undefined ? {} : { usage: response.usage }) };
    },
    async testConnection(signal) { const response = await requestCompletion([{ role: 'user', content: 'Connection test. Reply with a compact JSON object with reply, toolCalls, and notchPresentation.' }], signal, undefined, false); validateJsonContract(response.content); },
  };
}

function createMainAiRuntime({ config = {}, fetchImpl, sleep, timeoutFactory, random } = {}) {
  let active = null;
  const client = config.endpoint && config.apiKey && config.model ? createOpenAiCompatibleClient({ ...config, fetchImpl, sleep, timeoutFactory, random }) : null;
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

module.exports = { MAX_BODY_BYTES, safeEndpoint, redactedError, validateTurn, validateJsonContract, normalizeUsage, parseRetryAfter, retryDelayFor, classifyProviderFailure, attachAiRequestSenderLifecycle, createAiRequestCoordinator, replaceAiRequestCoordinator, createOpenAiCompatibleClient, createMainAiRuntime };

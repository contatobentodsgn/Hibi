const MAX_PROMPT_CHARS = 12_000;
const MAX_OUTPUT_CHARS = 8_000;

function createLocalModelWorker({ engine } = {}) {
  let loaded = false;
  const cancelled = new Set();
  if (!engine || typeof engine.load !== 'function' || typeof engine.complete !== 'function') throw new Error('Local model engine is unavailable.');
  return {
    async load(modelPath) { await engine.load(modelPath); loaded = true; return { status: 'ready' }; },
    async prompt({ requestId, prompt }) {
      if (!loaded) throw new Error('Local model is not loaded.');
      if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(requestId)) throw new Error('Invalid local model request id.');
      if (typeof prompt !== 'string' || prompt.length === 0 || prompt.length > MAX_PROMPT_CHARS) throw new Error('Local model prompt is invalid.');
      cancelled.delete(requestId);
      let output = '';
      for await (const delta of engine.complete(prompt)) {
        if (cancelled.has(requestId)) return { requestId, status: 'cancelled', text: output };
        if (typeof delta !== 'string') continue;
        output = (output + delta).slice(0, MAX_OUTPUT_CHARS);
      }
      return { requestId, status: 'complete', text: output };
    },
    cancel(requestId) { if (typeof requestId === 'string') cancelled.add(requestId); },
    async shutdown() { cancelled.clear(); loaded = false; if (typeof engine.shutdown === 'function') await engine.shutdown(); },
  };
}

module.exports = { MAX_PROMPT_CHARS, MAX_OUTPUT_CHARS, createLocalModelWorker };

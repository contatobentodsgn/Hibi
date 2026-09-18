const MAX_PROMPT_CHARS = 12_000;
const MAX_OUTPUT_CHARS = 8_000;

function createLocalModelWorker({ engine } = {}) {
  let loaded = false;
  const running = new Map();
  const waiting = new Set();
  const cancelledWhileWaiting = new Set();
  // Uma sessão do llama atende uma pergunta por vez: duas ao mesmo tempo disputariam o mesmo
  // contexto, e a segunda zeraria o histórico no meio da primeira. As perguntas entram numa fila.
  let queue = Promise.resolve();
  if (!engine || typeof engine.load !== 'function' || typeof engine.complete !== 'function') throw new Error('Local model engine is unavailable.');

  const answer = async ({ requestId, prompt }) => {
    waiting.delete(requestId);
    // Cancelada ainda na fila: nem chega ao motor.
    if (cancelledWhileWaiting.delete(requestId)) return { requestId, status: 'cancelled', text: '' };
    const controller = new AbortController();
    running.set(requestId, controller);
    let output = '';
    try {
      // O sinal chega ao motor: cancelar **interrompe** a geração, em vez de só ignorar o que ainda
      // viria. Sem ele, uma pergunta cancelada seguia gerando até 512 tokens, e a seguinte esperava.
      for await (const delta of engine.complete(prompt, { signal: controller.signal })) {
        if (controller.signal.aborted) break;
        if (typeof delta !== 'string') continue;
        output = (output + delta).slice(0, MAX_OUTPUT_CHARS);
      }
      return { requestId, status: controller.signal.aborted ? 'cancelled' : 'complete', text: output };
    } finally {
      if (running.get(requestId) === controller) running.delete(requestId);
    }
  };

  return {
    async load(modelPath) { await engine.load(modelPath); loaded = true; return { status: 'ready' }; },
    prompt({ requestId, prompt }) {
      if (!loaded) return Promise.reject(new Error('Local model is not loaded.'));
      if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(requestId)) return Promise.reject(new Error('Invalid local model request id.'));
      if (typeof prompt !== 'string' || prompt.length === 0 || prompt.length > MAX_PROMPT_CHARS) return Promise.reject(new Error('Local model prompt is invalid.'));
      waiting.add(requestId);
      const next = queue.then(() => answer({ requestId, prompt }));
      queue = next.catch(() => undefined);
      return next;
    },
    cancel(requestId) {
      if (running.has(requestId)) running.get(requestId).abort();
      else if (waiting.has(requestId)) cancelledWhileWaiting.add(requestId);
    },
    async shutdown() {
      for (const controller of running.values()) controller.abort();
      for (const requestId of waiting) cancelledWhileWaiting.add(requestId);
      running.clear();
      loaded = false;
      if (typeof engine.shutdown === 'function') await engine.shutdown();
    },
  };
}

module.exports = { MAX_PROMPT_CHARS, MAX_OUTPUT_CHARS, createLocalModelWorker };

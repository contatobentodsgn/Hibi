const { createLocalModelWorker } = require('./local-model-worker.cjs');

/**
 * O motor só entra em cena com um modelo **verificado**: `resolveVerifiedPath` devolve caminho apenas
 * quando o arquivo bate com o manifesto, e sem caminho não há o que carregar. É o que impede o app de
 * entregar ao llama.cpp um arquivo que alguém trocou.
 */
function createLocalModelService({ dataRoot, engineFactory } = {}) {
  let state = { status: 'unavailable', modelId: null, error: null };
  let worker = null;
  const publish = (patch) => { state = { ...state, ...patch }; return { ...state }; };
  return {
    state: () => ({ ...state }),
    async load({ manifest, modelPath }) {
      if (typeof engineFactory !== 'function') return publish({ status: 'unavailable', error: 'No local model engine is installed.' });
      // A fábrica pode ser assíncrona — carregar o llama.cpp é um `import()` — e sem esperar por ela o
      // worker recebia uma promessa no lugar do motor e recusava tudo com "engine is unavailable".
      worker = createLocalModelWorker({ engine: await engineFactory({ dataRoot, manifest, modelPath }) });
      await worker.load(modelPath);
      return publish({ status: 'ready', modelId: manifest.id, error: null });
    },
    async run(input) {
      if (!worker) return { requestId: input?.requestId ?? null, status: 'unavailable', text: '' };
      return worker.prompt(input);
    },
    cancel(requestId) { worker?.cancel(requestId); },
    async shutdown() { await worker?.shutdown(); worker = null; publish({ status: 'unavailable', modelId: null }); },
  };
}

module.exports = { createLocalModelService };

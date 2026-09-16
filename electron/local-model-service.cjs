const { createLocalModelWorker } = require('./local-model-worker.cjs');

function createLocalModelService({ dataRoot, engineFactory } = {}) {
  let state = { status: 'unavailable', modelId: null, error: null };
  let worker = null;
  const publish = (patch) => { state = { ...state, ...patch }; return { ...state }; };
  return {
    state: () => ({ ...state }),
    async load({ manifest, modelPath }) {
      if (typeof engineFactory !== 'function') return publish({ status: 'unavailable', error: 'No local model engine is installed.' });
      worker = createLocalModelWorker({ engine: engineFactory({ dataRoot, manifest, modelPath }) });
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

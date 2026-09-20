const { createLocalModelWorker } = require('./local-model-worker.cjs');

/**
 * O motor só entra em cena com um modelo **verificado**: `resolveVerifiedPath` devolve caminho apenas
 * quando o arquivo bate com o manifesto, e sem caminho não há o que carregar. É o que impede o app de
 * entregar ao llama.cpp um arquivo que alguém trocou.
 */
function createLocalModelService({ dataRoot, engineFactory } = {}) {
  let state = { status: 'unavailable', modelId: null, error: null };
  let worker = null;
  let loading = null;
  const publish = (patch) => { state = { ...state, ...patch }; return { ...state }; };

  const loadOnce = async ({ manifest, modelPath }) => {
    if (typeof engineFactory !== 'function') return publish({ status: 'unavailable', error: 'No local model engine is installed.' });
    publish({ status: 'loading', error: null });
    try {
      // A fábrica pode ser assíncrona — carregar o llama.cpp é um `import()` — e sem esperar por ela o
      // worker recebia uma promessa no lugar do motor e recusava tudo com "engine is unavailable".
      const next = createLocalModelWorker({ engine: await engineFactory({ dataRoot, manifest, modelPath }) });
      await next.load(modelPath);
      // Um motor anterior devolve a memória antes de sair de cena: são quase dois gigabytes.
      const previous = worker;
      worker = next;
      await previous?.shutdown();
      return publish({ status: 'ready', modelId: manifest.id, error: null });
    } catch (error) {
      publish({ status: 'error', error: error instanceof Error ? error.message : 'The local model could not load.' });
      throw error;
    }
  };

  return {
    state: () => ({ ...state }),
    /**
     * Uma carga por vez. Perguntar de novo enquanto o modelo carrega disparava uma segunda carga, que
     * trocava o worker por baixo da primeira e deixava o motor anterior — 1,8 GB — sem shutdown.
     */
    load(input) {
      if (!loading) loading = loadOnce(input).finally(() => { loading = null; });
      return loading;
    },
    async run(input) {
      if (!worker) return { requestId: input?.requestId ?? null, status: 'unavailable', text: '' };
      return worker.prompt(input);
    },
    cancel(requestId) { worker?.cancel(requestId); },
    async shutdown() { await worker?.shutdown(); worker = null; publish({ status: 'unavailable', modelId: null }); },
  };
}

/**
 * A pergunta ao cérebro offline, do jeito que o IPC a atende: carrega o modelo verificado se for
 * preciso e responde. Uma falha ao carregar (memória, binário nativo ausente, arquivo corrompido)
 * vira "indisponível" — e o Taby cai nas ferramentas locais — em vez de derrubar a pergunta.
 */
async function runWithVerifiedModel({ service, store, input }) {
  const requestId = typeof input?.requestId === 'string' ? input.requestId : null;
  if (service.state().status !== 'ready') {
    const file = await store.resolveVerifiedPath();
    if (!file) return { requestId, status: 'unavailable', text: '' };
    try {
      await service.load({ manifest: store.manifest(), modelPath: file });
    } catch {
      return { requestId, status: 'unavailable', text: '' };
    }
  }
  return service.run(input);
}

module.exports = { createLocalModelService, runWithVerifiedModel };

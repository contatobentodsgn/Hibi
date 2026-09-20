const test = require('node:test');
const assert = require('node:assert/strict');
const { createLocalModelService } = require('./local-model-service.cjs');

test('reports unavailable without an installed engine and never starts network work', async () => {
  const service = createLocalModelService({ dataRoot: '/project/.hibi-data' });
  assert.equal(service.state().status, 'unavailable');
  assert.equal((await service.run({ requestId: 'r1', prompt: 'Olá' })).status, 'unavailable');
});

test('loads an injected local engine and exposes bounded run/cancel lifecycle', async () => {
  const service = createLocalModelService({ dataRoot: '/project/.hibi-data', engineFactory: () => ({ load: async () => {}, complete: async function* () { yield 'local'; }, shutdown: async () => {} }) });
  await service.load({ manifest: { id: 'tiny-q4' }, modelPath: '/project/.hibi-data/.hibi-local-models/tiny-q4.bin' });
  assert.equal(service.state().status, 'ready');
  assert.deepEqual(await service.run({ requestId: 'r1', prompt: 'Olá' }), { requestId: 'r1', status: 'complete', text: 'local' });
  service.cancel('r1');
  await service.shutdown();
  assert.equal(service.state().status, 'unavailable');
});

test('uma fábrica assíncrona é esperada: é assim que o motor de verdade é carregado', async () => {
  const perguntas = [];
  const service = createLocalModelService({
    dataRoot: '/dados',
    // No app, a fábrica faz `import()` do motor: ela devolve promessa, não o motor pronto.
    engineFactory: async () => ({
      load: async () => {},
      complete: async function* (prompt) { perguntas.push(prompt); yield 'resposta'; },
    }),
  });

  const estado = await service.load({ manifest: { id: 'tiny-q4' }, modelPath: '/dados/tiny-q4.bin' });
  assert.equal(estado.status, 'ready');

  const resposta = await service.run({ requestId: 'r-1', prompt: 'oi' });
  assert.deepEqual(resposta, { requestId: 'r-1', status: 'complete', text: 'resposta' });
  assert.deepEqual(perguntas, ['oi']);
});

const { runWithVerifiedModel } = require('./local-model-service.cjs');

test('perguntar de novo enquanto o modelo carrega não carrega duas vezes', async () => {
  let fabricados = 0;
  let liberar;
  const carregando = new Promise((resolve) => { liberar = resolve; });
  const service = createLocalModelService({ dataRoot: '/dados', engineFactory: async () => { fabricados += 1; return { load: () => carregando, complete: async function* () {}, shutdown: async () => {} }; } });

  const primeira = service.load({ manifest: { id: 'm' }, modelPath: '/m.bin' });
  const segunda = service.load({ manifest: { id: 'm' }, modelPath: '/m.bin' });
  liberar();
  await Promise.all([primeira, segunda]);

  assert.equal(fabricados, 1, 'dois motores de 1,8 GB na memória');
  assert.equal(service.state().status, 'ready');
});

test('recarregar devolve a memória do motor anterior', async () => {
  const desligados = [];
  let n = 0;
  const service = createLocalModelService({ dataRoot: '/dados', engineFactory: async () => { const id = ++n; return { load: async () => {}, complete: async function* () {}, shutdown: async () => { desligados.push(id); } }; } });

  await service.load({ manifest: { id: 'm' }, modelPath: '/m.bin' });
  await service.load({ manifest: { id: 'm' }, modelPath: '/m.bin' });

  assert.deepEqual(desligados, [1]);
});

test('uma falha ao carregar vira "indisponível" na pergunta, e o estado guarda o motivo', async () => {
  const service = createLocalModelService({ dataRoot: '/dados', engineFactory: async () => ({ load: async () => { throw new Error('sem memória'); }, complete: async function* () {} }) });
  const store = { resolveVerifiedPath: async () => '/m.bin', manifest: () => ({ id: 'm' }) };

  assert.deepEqual(await runWithVerifiedModel({ service, store, input: { requestId: 'r1', prompt: 'oi' } }), { requestId: 'r1', status: 'unavailable', text: '' });
  assert.deepEqual({ status: service.state().status, error: service.state().error }, { status: 'error', error: 'sem memória' });
});

test('sem modelo verificado, nada é carregado', async () => {
  let carregou = false;
  const service = createLocalModelService({ dataRoot: '/dados', engineFactory: async () => { carregou = true; return {}; } });

  const resposta = await runWithVerifiedModel({ service, store: { resolveVerifiedPath: async () => null, manifest: () => null }, input: { requestId: 'r1', prompt: 'oi' } });

  assert.equal(resposta.status, 'unavailable');
  assert.equal(carregou, false);
});

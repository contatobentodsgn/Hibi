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

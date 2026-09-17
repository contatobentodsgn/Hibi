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

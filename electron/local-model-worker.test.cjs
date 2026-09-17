const test = require('node:test');
const assert = require('node:assert/strict');
const { createLocalModelWorker, MAX_PROMPT_CHARS } = require('./local-model-worker.cjs');

function engine() { return { load: async () => {}, complete: async function* () { yield 'Olá '; yield 'offline'; }, shutdown: async () => {} }; }

test('loads the engine and streams a bounded completion', async () => {
  const worker = createLocalModelWorker({ engine: engine() });
  await worker.load('/project/.hibi-local-models/tiny-q4.bin');
  assert.deepEqual(await worker.prompt({ requestId: 'r1', prompt: 'Olá' }), { requestId: 'r1', status: 'complete', text: 'Olá offline' });
});

test('rejects prompts before load and beyond the safety limit', async () => {
  const worker = createLocalModelWorker({ engine: engine() });
  await assert.rejects(worker.prompt({ requestId: 'r1', prompt: 'Olá' }), /not loaded/);
  await worker.load('/project/.hibi-local-models/tiny-q4.bin');
  await assert.rejects(worker.prompt({ requestId: 'r1', prompt: 'x'.repeat(MAX_PROMPT_CHARS + 1) }), /invalid/);
});

test('cancellation is idempotent and shutdown releases the engine', async () => {
  let released = false;
  const worker = createLocalModelWorker({ engine: { load: async () => {}, complete: async function* () { yield 'one'; await new Promise((resolve) => setTimeout(resolve, 5)); yield 'two'; }, shutdown: async () => { released = true; } } });
  await worker.load('/model');
  const pending = worker.prompt({ requestId: 'r1', prompt: 'test' });
  worker.cancel('r1'); worker.cancel('r1');
  assert.equal((await pending).status, 'cancelled');
  await worker.shutdown();
  assert.equal(released, true);
});

test('a resposta tem teto: um modelo que não para de falar não vira um texto sem fim', async () => {
  const { MAX_OUTPUT_CHARS, createLocalModelWorker } = require('./local-model-worker.cjs');
  const worker = createLocalModelWorker({
    engine: {
      load: async () => {},
      complete: async function* () { for (let i = 0; i < 40; i += 1) yield 'x'.repeat(1_000); },
    },
  });
  await worker.load('/modelo.bin');

  const resposta = await worker.prompt({ requestId: 'r-teto', prompt: 'fale muito' });

  assert.equal(resposta.status, 'complete');
  assert.equal(resposta.text.length, MAX_OUTPUT_CHARS);
});

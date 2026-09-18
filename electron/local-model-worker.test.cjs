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

// Um motor que só para quando o sinal manda: é assim que o llama se comporta com stopOnAbortSignal.
function motorQueObedeceOSinal(registro) {
  return {
    load: async () => {},
    complete: async function* (prompt, { signal } = {}) {
      registro.push(`começou ${prompt}`);
      for (let i = 0; i < 50; i += 1) {
        if (signal?.aborted) { registro.push(`parou ${prompt}`); return; }
        await new Promise((resolve) => setTimeout(resolve, 2));
        yield `${i} `;
      }
      registro.push(`terminou ${prompt}`);
    },
  };
}

test('cancelar interrompe a geração no motor, em vez de deixá-la correr até o fim', async () => {
  let sinalDoMotor = null;
  const engine = {
    load: async () => {},
    // O llama para quando o sinal que recebeu é abortado (stopOnAbortSignal): é esse sinal que importa.
    complete: async function* (_prompt, { signal } = {}) { sinalDoMotor = signal; for (let i = 0; i < 50; i += 1) { await new Promise((resolve) => setTimeout(resolve, 2)); yield `${i} `; } },
  };
  const worker = createLocalModelWorker({ engine });
  await worker.load('/model');
  const pendente = worker.prompt({ requestId: 'r1', prompt: 'a' });
  await new Promise((resolve) => setTimeout(resolve, 10));

  worker.cancel('r1');

  assert.equal((await pendente).status, 'cancelled');
  assert.equal(sinalDoMotor?.aborted, true, 'o motor precisa receber o sinal, e ele precisa estar abortado');
});

test('duas perguntas não disputam a sessão: a segunda espera a primeira', async () => {
  const registro = [];
  const worker = createLocalModelWorker({ engine: motorQueObedeceOSinal(registro) });
  await worker.load('/model');

  const primeira = worker.prompt({ requestId: 'r1', prompt: 'a' });
  const segunda = worker.prompt({ requestId: 'r2', prompt: 'b' });
  await Promise.all([primeira, segunda]);

  assert.deepEqual(registro, ['começou a', 'terminou a', 'começou b', 'terminou b']);
});

test('uma pergunta cancelada ainda na fila nem chega ao motor', async () => {
  const registro = [];
  const worker = createLocalModelWorker({ engine: motorQueObedeceOSinal(registro) });
  await worker.load('/model');
  const primeira = worker.prompt({ requestId: 'r1', prompt: 'a' });
  const segunda = worker.prompt({ requestId: 'r2', prompt: 'b' });

  worker.cancel('r2');

  assert.equal((await segunda).status, 'cancelled');
  await primeira;
  assert.equal(registro.includes('começou b'), false);
});

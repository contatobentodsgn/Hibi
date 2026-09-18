const test = require('node:test');
const assert = require('node:assert/strict');
const { createLocalVoiceService } = require('./local-voice.cjs');

test('reports unavailable without a native adapter', async () => {
  const voice = createLocalVoiceService();
  assert.equal((await voice.listen()).status, 'unavailable');
  assert.equal((await voice.speak('Olá')).status, 'unavailable');
});

test('supports locale selection, listening and speaking through a local adapter', async () => {
  const calls = [];
  const voice = createLocalVoiceService({ adapter: { listen: async ({ locale, onText }) => { calls.push(['listen', locale]); onText?.('olá'); }, speak: async (_text, { locale }) => calls.push(['speak', locale]) } });
  voice.setLocale('en-US');
  await voice.listen({ onText: (text) => calls.push(['text', text]) });
  await voice.speak('hello');
  assert.deepEqual(calls, [['listen', 'en-US'], ['text', 'olá'], ['speak', 'en-US']]);
  assert.equal(voice.state().status, 'ready');
});

test('rejects oversized speech and returns to ready after stop', async () => {
  const voice = createLocalVoiceService({ adapter: { listen: async () => {}, speak: async () => {} } });
  await assert.rejects(voice.speak('x'.repeat(8001)), /invalid/);
  await voice.listen();
  voice.stop();
  assert.equal(voice.state().status, 'ready');
});

test('um idioma desconhecido volta ao padrão, e é o normalizado que chega ao adaptador', async () => {
  const pedidos = [];
  const adapter = { listen: (request) => { pedidos.push(request.locale); return Promise.resolve(); }, stop() {}, speak: () => Promise.resolve() };
  const service = createLocalVoiceService({ adapter });

  // Só os idiomas com reconhecimento suportado entram; o resto vira o padrão, em vez de virar
  // argumento do helper nativo.
  assert.equal(service.setLocale('klingon').locale, 'pt-BR');
  assert.equal(service.setLocale('en-US').locale, 'en-US');

  await service.listen({});
  await service.listen({ locale: 'xx-YY' });

  assert.deepEqual(pedidos, ['en-US', 'pt-BR']);
});

test('o motivo que o helper deu atravessa o serviço até a tela', async () => {
  const recusa = Object.assign(new Error('Speech recognition permission denied'), { reason: 'permission' });
  const service = createLocalVoiceService({ adapter: { listen: async () => { throw recusa; } } });

  assert.deepEqual(await service.listen(), { status: 'error', locale: 'pt-BR', error: 'Speech recognition permission denied', reason: 'permission', ended: null });
});

test('uma escuta que termina bem volta a "pronto", sem erro nem motivo', async () => {
  const service = createLocalVoiceService({ adapter: { listen: async () => undefined } });

  assert.deepEqual(await service.listen(), { status: 'ready', locale: 'pt-BR', error: null, reason: null, ended: 'done' });
});

test('com autoStop, o serviço pede ao adaptador que encerre na pausa e diz por que terminou', async () => {
  const pedidos = [];
  const service = createLocalVoiceService({ adapter: { listen: async (request) => { pedidos.push(request); return { ended: 'silence' }; } } });
  assert.equal((await service.listen({ autoStop: true })).ended, 'silence');
  assert.equal(pedidos[0].silenceMs > 0 && pedidos[0].noSpeechMs > pedidos[0].silenceMs, true);
  await service.listen();
  assert.equal(pedidos[1].silenceMs, undefined);
});

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

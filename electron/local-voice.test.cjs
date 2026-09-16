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

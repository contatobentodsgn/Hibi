const test = require('node:test');
const assert = require('node:assert/strict');
const { createMacVoiceAdapter } = require('./local-voice-macos.cjs');

test('uses the native macOS voice and locale mapping', async () => {
  const calls = [];
  const child = { once(event, fn) { if (event === 'close') queueMicrotask(() => fn(0, null)); return this; }, kill() {} };
  const adapter = createMacVoiceAdapter({ spawnProcess: (...args) => { calls.push(args); return child; } });
  await adapter.speak('Olá', { locale: 'pt-BR' });
  assert.deepEqual(calls[0].slice(0, 2), ['say', ['-v', 'Luciana', 'Olá']]);
});

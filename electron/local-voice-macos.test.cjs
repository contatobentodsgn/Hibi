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

// O helper fala JSON por linha. O que interessa ao app é o texto reconhecido; qualquer outra coisa,
// inclusive a recusa de reconhecer fora do dispositivo, não pode virar texto digitado por engano.
const helperFalso = (linhas, saida = 0) => {
  const ouvintes = new Map();
  const child = {
    stdout: { setEncoding() {}, on(event, fn) { if (event === 'data') queueMicrotask(() => linhas.forEach((linha) => fn(`${linha}\n`))); } },
    once(event, fn) { ouvintes.set(event, fn); if (event === 'close') queueMicrotask(() => setTimeout(() => fn(saida), 0)); return this; },
    kill() {},
  };
  return child;
};

test('repassa só o texto reconhecido, e não as outras linhas do helper', async () => {
  const recebidos = [];
  const adapter = createMacVoiceAdapter({
    spawnProcess: () => helperFalso(['{"type":"ready"}', '{"type":"text","final":false,"text":"agendar"}', 'linha quebrada', '{"type":"text","final":true,"text":"agendar reunião"}']),
    helperPath: '/tmp/hibi-voice-falso',
  });

  await adapter.listen({ locale: 'pt-BR', onText: (texto) => recebidos.push(texto) });

  assert.deepEqual(recebidos, ['agendar', 'agendar reunião']);
});

test('uma recusa do helper vira erro, com o motivo que ele deu', async () => {
  const adapter = createMacVoiceAdapter({
    // É o que o helper responde quando o idioma não tem reconhecimento no próprio Mac: ele recusa,
    // em vez de deixar o áudio ir para os servidores da Apple.
    spawnProcess: () => helperFalso(['{"type":"error","message":"On-device speech recognition is unavailable for this language"}'], 1),
    helperPath: '/tmp/hibi-voice-falso',
  });

  await assert.rejects(() => adapter.listen({ locale: 'pt-BR', onText: () => {} }), /exited with code 1/);
});

test('o caminho do helper segue os recursos do app empacotado', () => {
  const chamadas = [];
  const adapter = createMacVoiceAdapter({ spawnProcess: (...args) => { chamadas.push(args); return helperFalso([]); }, helperPath: '/Applications/Hibi.app/Contents/Resources/native/voice/build/hibi-voice' });

  void adapter.listen({ locale: 'en-US', onText: () => {} });

  assert.equal(chamadas[0][0], '/Applications/Hibi.app/Contents/Resources/native/voice/build/hibi-voice');
  assert.deepEqual(chamadas[0][1], ['listen', 'en-US']);
});

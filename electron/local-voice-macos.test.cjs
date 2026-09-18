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

  // O motivo dele chega inteiro; antes chegava só "exited with code 1", e a tela não tinha o que dizer.
  await assert.rejects(() => adapter.listen({ locale: 'pt-BR', onText: () => {} }), (error) => /On-device speech recognition is unavailable/.test(error.message) && error.reason === 'no-on-device');
});

test('o caminho do helper segue os recursos do app empacotado', () => {
  const chamadas = [];
  const adapter = createMacVoiceAdapter({ spawnProcess: (...args) => { chamadas.push(args); return helperFalso([]); }, helperPath: '/Applications/Hibi.app/Contents/Resources/native/voice/build/hibi-voice' });

  void adapter.listen({ locale: 'en-US', onText: () => {} });

  assert.equal(chamadas[0][0], '/Applications/Hibi.app/Contents/Resources/native/voice/build/hibi-voice');
  assert.deepEqual(chamadas[0][1], ['listen', 'en-US']);
});

// Em desenvolvimento o `process.resourcesPath` aponta para dentro do Electron baixado, onde o
// helper nunca esteve: adivinhar por ele fazia a voz morrer com ENOENT, sem nada na tela.
test('escolhe o helper que existe, não o que a variável do Electron sugere', () => {
  const { resolveHelperPath } = require('./local-voice-macos.cjs');
  const noRepositorio = require('node:path').join(__dirname, '..', 'native/voice/build/hibi-voice');
  const original = process.resourcesPath;
  // Em desenvolvimento esta variável existe e aponta para dentro do Electron baixado, onde o helper
  // nunca esteve: é exatamente o caso em que adivinhar por ela quebra a voz.
  Object.defineProperty(process, 'resourcesPath', { value: '/repo/node_modules/electron/dist/Electron.app/Contents/Resources', configurable: true });
  try {
    assert.equal(resolveHelperPath({ exists: (candidate) => candidate === noRepositorio }), noRepositorio);
  } finally {
    Object.defineProperty(process, 'resourcesPath', { value: original, configurable: true });
  }
});

test('no app empacotado, o helper dos recursos ganha do caminho do repositório', () => {
  const { resolveHelperPath } = require('./local-voice-macos.cjs');
  const original = process.resourcesPath;
  Object.defineProperty(process, 'resourcesPath', { value: '/Applications/Hibi.app/Contents/Resources', configurable: true });
  try {
    assert.equal(resolveHelperPath({ exists: () => true }), '/Applications/Hibi.app/Contents/Resources/native/voice/build/hibi-voice');
  } finally {
    Object.defineProperty(process, 'resourcesPath', { value: original, configurable: true });
  }
});

test('sem helper em lugar nenhum, o caminho do repositório é o que aparece no erro', () => {
  const { resolveHelperPath } = require('./local-voice-macos.cjs');

  assert.equal(resolveHelperPath({ exists: () => false }), require('node:path').join(__dirname, '..', 'native/voice/build/hibi-voice'));
});

// Um helper falso que encerra do jeito pedido: por código, por sinal ou emitindo um erro antes.
function helperQueEncerra({ linhas = [], code = 0, signal = null, pedacos = null } = {}) {
  const ouvintes = new Map();
  const child = {
    killed: false,
    stdout: { setEncoding() {}, on(event, fn) { if (event === 'data') queueMicrotask(() => (pedacos ?? linhas.map((linha) => `${linha}\n`)).forEach((pedaco) => fn(pedaco))); } },
    once(event, fn) { ouvintes.set(event, fn); if (event === 'close') setTimeout(() => fn(code, signal), 5); return this; },
    kill() { this.killed = true; },
  };
  return child;
}

test('parar a escuta é pedido de quem usa, e não vira erro "exited with code null"', async () => {
  const adapter = createMacVoiceAdapter({ spawnProcess: () => helperQueEncerra({ code: null, signal: 'SIGTERM' }), helperPath: '/tmp/hibi-voice-falso' });

  await adapter.listen({ locale: 'pt-BR' });
});

test('o motivo que o helper dá chega a quem chamou, com um código estável', async () => {
  const casos = [
    ['Speech recognition permission denied', 'permission'],
    ['On-device speech recognition is unavailable for this language', 'no-on-device'],
    ['Nenhuma entrada de microfone está disponível', 'no-microphone'],
  ];
  for (const [mensagem, motivo] of casos) {
    const adapter = createMacVoiceAdapter({ spawnProcess: () => helperQueEncerra({ linhas: [JSON.stringify({ type: 'error', message: mensagem })], code: 0 }), helperPath: '/tmp/hibi-voice-falso' });

    await assert.rejects(() => adapter.listen({ locale: 'pt-BR' }), (error) => error.message === mensagem && error.reason === motivo);
  }
});

test('uma linha partida em dois pedaços não perde o texto falado', async () => {
  const recebidos = [];
  const linha = JSON.stringify({ type: 'text', final: true, text: 'agendar reunião amanhã' });
  const adapter = createMacVoiceAdapter({ spawnProcess: () => helperQueEncerra({ pedacos: [linha.slice(0, 20), `${linha.slice(20)}\n`] }), helperPath: '/tmp/hibi-voice-falso' });

  await adapter.listen({ locale: 'pt-BR', onText: (text) => recebidos.push(text) });

  assert.deepEqual(recebidos, ['agendar reunião amanhã']);
});

test('um encerramento que ninguém pediu continua sendo erro', async () => {
  const adapter = createMacVoiceAdapter({ spawnProcess: () => helperQueEncerra({ code: 134, signal: null }), helperPath: '/tmp/hibi-voice-falso' });

  await assert.rejects(() => adapter.listen({ locale: 'pt-BR' }), /exited with code 134/);
});

// Um helper que fala e depois fica quieto, com relógio controlado: a pausa encerra a escuta sozinha.
const helperQueFala = (linhas) => {
  const ouvintes = new Map();
  let aoFalar;
  const child = {
    killed: null,
    stdout: { setEncoding() {}, on(event, fn) { if (event === 'data') aoFalar = fn; } },
    once(event, fn) { ouvintes.set(event, fn); return this; },
    kill(signal) { child.killed = signal; ouvintes.get('close')?.(null, signal); },
    falar: () => linhas.forEach((linha) => aoFalar(`${linha}\n`)),
  };
  return child;
};
const relogio = () => {
  const timers = new Map(); let proximo = 0;
  return { set: (fn, ms) => { proximo += 1; timers.set(proximo, { fn, ms }); return proximo; }, clear: (id) => timers.delete(id), disparar: (ms) => { for (const [id, timer] of [...timers]) if (timer.ms === ms) { timers.delete(id); timer.fn(); } }, pendentes: () => [...timers.values()].map((timer) => timer.ms), agendados: () => proximo };
};

test('depois de falar, a pausa encerra a escuta e o motivo é "silence"', async () => {
  const child = helperQueFala(['{"type":"text","final":false,"text":"crie uma tarefa"}']);
  const tempo = relogio();
  const adapter = createMacVoiceAdapter({ spawnProcess: () => child, helperPath: '/tmp/h', setTimer: tempo.set, clearTimer: tempo.clear });

  const escuta = adapter.listen({ onText: () => {}, silenceMs: 1600, noSpeechMs: 8000 });
  assert.deepEqual(tempo.pendentes(), [8000]);
  child.falar();
  // A primeira palavra troca a espera por fala pela espera da pausa.
  assert.deepEqual(tempo.pendentes(), [1600]);
  tempo.disparar(1600);

  assert.deepEqual(await escuta, { ended: 'silence' });
  assert.equal(child.killed, 'SIGTERM');
});

test('sem nenhuma palavra, a escuta termina como "no-speech"', async () => {
  const child = helperQueFala([]);
  const tempo = relogio();
  const adapter = createMacVoiceAdapter({ spawnProcess: () => child, helperPath: '/tmp/h', setTimer: tempo.set, clearTimer: tempo.clear });

  const escuta = adapter.listen({ onText: () => {}, silenceMs: 1600, noSpeechMs: 8000 });
  tempo.disparar(8000);

  assert.deepEqual(await escuta, { ended: 'no-speech' });
});

test('parar pela tela continua sendo "stopped", e sem os prazos nada encerra sozinho', async () => {
  const child = helperQueFala(['{"type":"text","final":false,"text":"oi"}']);
  const tempo = relogio();
  const adapter = createMacVoiceAdapter({ spawnProcess: () => child, helperPath: '/tmp/h', setTimer: tempo.set, clearTimer: tempo.clear });

  const escuta = adapter.listen({ onText: () => {} });
  child.falar();
  assert.deepEqual(tempo.pendentes(), []);
  adapter.stop();

  assert.deepEqual(await escuta, { ended: 'stopped' });
});

// Visto no app instalado: a escuta demorava a parar. O reconhecedor reenvia o mesmo parcial enquanto o
// microfone está aberto, e cada reenvio reiniciava a contagem da pausa.
test('o mesmo texto reenviado não adia o fim; só uma mudança do texto adia', async () => {
  const child = helperQueFala(['{"type":"text","final":false,"text":"crie uma tarefa"}']);
  const tempo = relogio();
  const adapter = createMacVoiceAdapter({ spawnProcess: () => child, helperPath: '/tmp/h', setTimer: tempo.set, clearTimer: tempo.clear });
  const escuta = adapter.listen({ onText: () => {}, silenceMs: 1300, noSpeechMs: 8000 });

  child.falar();
  const agendados = tempo.agendados();
  child.falar();
  child.falar();
  assert.equal(tempo.agendados(), agendados, 'repetir o mesmo parcial não pode reagendar a pausa');
  tempo.disparar(1300);

  assert.deepEqual(await escuta, { ended: 'silence' });
});

test('com ruído mudando o parcial sem parar, o teto encerra a escuta', async () => {
  let fala;
  const ouvintes = new Map();
  const child = { stdout: { setEncoding() {}, on(event, fn) { if (event === 'data') fala = fn; } }, once(event, fn) { ouvintes.set(event, fn); return this; }, kill(signal) { ouvintes.get('close')?.(null, signal); } };
  const tempo = relogio();
  const adapter = createMacVoiceAdapter({ spawnProcess: () => child, helperPath: '/tmp/h', setTimer: tempo.set, clearTimer: tempo.clear });
  const escuta = adapter.listen({ onText: () => {}, silenceMs: 1300, noSpeechMs: 8000, maxSpeechMs: 20000 });

  for (const palavra of ['a', 'a b', 'a b c']) fala(`{"type":"text","final":false,"text":"${palavra}"}\n`);
  assert.ok(tempo.pendentes().includes(20000));
  tempo.disparar(20000);

  assert.deepEqual(await escuta, { ended: 'silence' });
});

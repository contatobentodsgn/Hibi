const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');

const VOICES = { 'pt-BR': 'Luciana', 'en-US': 'Samantha' };
const HELPER = 'native/voice/build/hibi-voice';

/**
 * No app empacotado o helper mora nos recursos; em desenvolvimento, no repositório. Adivinhar pelo
 * `process.resourcesPath` escolhia, em desenvolvimento, uma pasta dentro do Electron baixado, onde
 * o helper nunca esteve: a voz morria com `ENOENT`. Então a escolha é pelo que existe, e o último
 * candidato é o que sobra para a mensagem de erro dizer onde se procurou.
 */
function resolveHelperPath({ exists = existsSync } = {}) {
  const candidates = [];
  if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, HELPER));
  candidates.push(path.join(__dirname, '..', HELPER));
  return candidates.find((candidate) => exists(candidate)) ?? candidates[candidates.length - 1];
}

/** Um motivo estável para a tela escolher o texto, em vez de repetir a mensagem do helper. */
function voiceFailureReason(message) {
  if (/permission/i.test(message)) return 'permission';
  if (/on-device/i.test(message)) return 'no-on-device';
  if (/microfone|microphone/i.test(message)) return 'no-microphone';
  return 'failed';
}

function createMacVoiceAdapter({ spawnProcess = spawn, helperPath, exists = existsSync, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const resolvedHelperPath = helperPath || resolveHelperPath({ exists });
  let child = null;
  return {
    /**
     * Com `silenceMs`, a escuta termina sozinha quando a fala para: o reconhecimento no próprio Mac quase
     * nunca dá o resultado final por conta própria, e sem isso a pessoa precisava apertar Parar. Com
     * `noSpeechMs`, termina também quando ninguém disse nada. O motivo volta em `ended`.
     */
    listen({ locale = 'pt-BR', onText, silenceMs = 0, noSpeechMs = 0, maxSpeechMs = 0, vocabulary = [] } = {}) {
      child?.kill('SIGTERM');
      // O vocabulário vai pela entrada do helper, não pela linha de comando: os nomes da pessoa não ficam
      // expostos na lista de processos. O helper lê até o fim da entrada antes de abrir o microfone.
      const current = spawnProcess(resolvedHelperPath, ['listen', locale, '--vocabulary-stdin'], { stdio: ['pipe', 'pipe', 'ignore'] });
      child = current;
      current.stdin?.on?.('error', () => { /* helper que já saiu não recebe o vocabulário, e tudo bem */ });
      current.stdin?.end(JSON.stringify(Array.isArray(vocabulary) ? vocabulary : []));
      let failure = null;
      let ended = null;
      let timer = null;
      const endAfter = (ms, reason) => {
        if (timer) clearTimer(timer);
        timer = ms > 0 ? setTimer(() => { ended = reason; current.kill('SIGTERM'); }, ms) : null;
      };
      endAfter(noSpeechMs, 'no-speech');
      // O reconhecedor reenvia o mesmo texto parcial enquanto o microfone está aberto: contar a pausa a
      // partir de cada reenvio fazia a escuta demorar a parar. A pausa conta da última mudança do texto,
      // e um teto depois da primeira palavra encerra mesmo com ruído de fundo mudando o parcial.
      let lastText = '';
      let cap = null;
      // O helper fala JSON por linha, mas o pipe entrega pedaços: uma linha pode chegar partida em
      // dois. Guardar o resto evita perder justamente o texto final da fala.
      let pending = '';
      current.stdout?.setEncoding('utf8');
      current.stdout?.on('data', (data) => {
        const lines = (pending + data).split('\n');
        pending = lines.pop() ?? '';
        for (const line of lines.filter(Boolean)) {
          try {
            const event = JSON.parse(line);
            if (event.type === 'text') {
              onText?.(event.text);
              const text = typeof event.text === 'string' ? event.text.trim() : '';
              if (text && text !== lastText) {
                lastText = text;
                endAfter(silenceMs, 'silence');
                if (!cap && maxSpeechMs > 0) cap = setTimer(() => { ended = 'silence'; current.kill('SIGTERM'); }, maxSpeechMs);
              }
            }
            // O helper diz por que parou (permissão, idioma sem modelo local, sem microfone). Antes
            // isso era descartado e a tela mostrava uma frase genérica que não dizia o que houve.
            else if (event.type === 'error' && typeof event.message === 'string') failure = event.message;
          } catch { /* linha que não é JSON não vira texto digitado */ }
        }
      });
      return new Promise((resolve, reject) => {
        current.once('error', reject);
        current.once('close', (code, signal) => {
          if (timer) clearTimer(timer);
          if (cap) clearTimer(cap);
          if (child === current) child = null;
          if (failure) return reject(Object.assign(new Error(failure), { reason: voiceFailureReason(failure) }));
          // Parar a escuta é pedido de quem usa, não falha: o helper encerra por SIGTERM. Tratar isso
          // como erro fazia toda escuta interrompida terminar em "exited with code null".
          if (code === 0) return resolve({ ended: ended ?? 'done' });
          if (signal === 'SIGTERM') return resolve({ ended: ended ?? 'stopped' });
          reject(new Error(`macOS speech recognition exited with code ${code}`));
        });
      });
    },
    speak(text, { locale = 'pt-BR' } = {}) {
      child?.kill('SIGTERM');
      child = spawnProcess('say', ['-v', VOICES[locale] || VOICES['pt-BR'], text], { stdio: 'ignore' });
      return new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code, signal) => { child = null; code === 0 || signal === 'SIGTERM' ? resolve() : reject(new Error(`macOS speech exited with code ${code}`)); });
      });
    },
    stop() { child?.kill('SIGTERM'); child = null; },
  };
}

module.exports = { resolveHelperPath, createMacVoiceAdapter, voiceFailureReason };

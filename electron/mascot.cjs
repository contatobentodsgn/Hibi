const path = require('node:path');

/**
 * O mascote oficial no notch: um vídeo por estado, e nada além dele. Texto, ditado e botões moram na
 * barra abaixo do notch (`taby-bar.cjs`); o notch só mostra o gato e as animações dele.
 *
 * Os vídeos saem de "Interactive States/Prontos", convertidos sem som, recortados para o notch e em
 * tamanho retina, e ficam em `public/mascot`.
 */
const ANIMATIONS = Object.freeze({
  idle: ['idle'],
  curious: ['idle_curious'],
  wander: ['idle_wander'],
  sleep: ['sleep'],
  listening: ['listening'],
  thinking: ['idle_curious'],
  attention: ['listening'],
  happy: ['happy_1', 'happy_2', 'happy_3', 'happy_4'],
  sad: ['sad_1', 'sad_2', 'sad_3'],
  focus: ['focus'],
  love: ['love'],
});

// O estado do mascote para cada tipo de apresentação do companion.
const STATE_FOR_KIND = Object.freeze({
  idle: 'idle',
  listening: 'listening',
  thinking: 'thinking',
  acting: 'thinking',
  result: 'happy',
  confirmation: 'attention',
  reminder: 'attention',
  focus: 'focus',
  error: 'sad',
});

const mascotStateFor = (kind) => STATE_FOR_KIND[kind] ?? 'idle';

function createMascot({ root, pick = Math.random } = {}) {
  if (typeof root !== 'string' || !root) throw new Error('A mascot asset folder is required.');
  return {
    stateFor: mascotStateFor,
    /** O vídeo de um estado. Com variações (feliz, triste), uma delas, sorteada. */
    animationPath(state) {
      const choices = ANIMATIONS[state] ?? ANIMATIONS.idle;
      const index = Math.min(choices.length - 1, Math.floor(pick() * choices.length));
      return path.join(root, `${choices[index]}.mp4`);
    },
  };
}

// Quanto tempo sem nada acontecer até cada estágio do repouso: atento, curioso, dando uma volta, dormindo.
const IDLE_STAGES = Object.freeze([
  { afterMs: 30_000, state: 'curious' },
  { afterMs: 60_000, state: 'wander' },
  { afterMs: 5 * 60_000, state: 'sleep' },
]);

/**
 * O repouso muda com o tempo sem nada acontecer. `reset` volta ao começo (qualquer apresentação reseta);
 * `stop` para tudo enquanto outra coisa está no notch.
 */
// Os timers do repouso nunca seguram o processo aberto: sair do app não espera o gato dormir.
const detachedTimer = (fn, ms) => { const timer = setTimeout(fn, ms); timer.unref?.(); return timer; };

function createIdleEscalation({ onState, setTimer = detachedTimer, clearTimer = clearTimeout, stages = IDLE_STAGES } = {}) {
  let timers = [];
  const stop = () => { for (const timer of timers) clearTimer(timer); timers = []; };
  return {
    reset() {
      stop();
      timers = stages.map((stage) => setTimer(() => onState(stage.state), stage.afterMs));
    },
    stop,
  };
}

module.exports = { ANIMATIONS, IDLE_STAGES, createIdleEscalation, createMascot, mascotStateFor };

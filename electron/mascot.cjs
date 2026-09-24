const path = require('node:path');

/**
 * O mascote oficial no notch: um vídeo por estado, e nada além dele. Texto, ditado e botões moram na
 * barra abaixo do notch (`assistant-bar.cjs`); o notch só mostra o gato e as animações dele.
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

// A entrada deve concluir antes do loop contínuo. Estados sem entrada já começam no loop; estados
// transitórios voltam ao idle quando o clipe de entrada termina.
const SEQUENCE_FOR_KIND = Object.freeze({
  idle: { loop: 'idle' },
  listening: { entry: 'curious', loop: 'listening' },
  thinking: { loop: 'thinking' },
  acting: { loop: 'focus' },
  result: { entry: 'happy', loop: 'idle' },
  confirmation: { entry: 'attention', loop: 'idle' },
  reminder: { entry: 'attention', loop: 'idle' },
  focus: { loop: 'focus' },
  error: { entry: 'sad', loop: 'idle' },
});

// O reducer é a autoridade sobre entry/loop. Aqui traduzimos seus IDs semânticos para os clipes
// disponíveis do mascote Pixano; IDs desconhecidos nunca viram caminhos de arquivo.
const STATE_FOR_ANIMATION_ID = Object.freeze({
  idle_01_loop: 'idle',
  listening_in: 'curious',
  listening_loop: 'listening',
  searching_loop: 'thinking',
  creating_task_loop: 'focus',
  confirmation: 'attention',
  task_completed: 'happy',
  disappointed: 'sad',
  waiting_01: 'attention',
  warning_01: 'attention',
  working_laptop_in: 'focus',
  working_laptop_bored_loop: 'curious',
  working_laptop_normal_loop: 'focus',
  working_laptop_excited_loop: 'happy',
  listening_music_loop: 'listening',
});

const mascotStateFor = (kind) => STATE_FOR_KIND[kind] ?? 'idle';

function createMascot({ root, pick = Math.random } = {}) {
  if (typeof root !== 'string' || !root) throw new Error('A mascot asset folder is required.');
  const previousIndexByState = new Map();
  let nextSequenceKey = 0;
  return {
    stateFor: mascotStateFor,
    /** O vídeo de um estado. Variações emocionais não repetem a escolha imediatamente anterior. */
    animationPath(state) {
      const choices = ANIMATIONS[state] ?? ANIMATIONS.idle;
      let index = Math.min(choices.length - 1, Math.floor(pick() * choices.length));
      const previous = previousIndexByState.get(state);
      if (choices.length > 1 && index === previous) {
        const offset = 1 + Math.min(choices.length - 2, Math.floor(pick() * (choices.length - 1)));
        index = (index + offset) % choices.length;
      }
      previousIndexByState.set(state, index);
      return path.join(root, `${choices[index]}.mp4`);
    },
    /** Animação transitória (uma execução), loop do estado e retorno seguro ao repouso. */
    sequenceForKind(kind) {
      const sequence = SEQUENCE_FOR_KIND[kind] ?? SEQUENCE_FOR_KIND.idle;
      const entryAnimationPath = sequence.entry ? this.animationPath(sequence.entry) : null;
      const loopAnimationPath = sequence.loop ? this.animationPath(sequence.loop) : null;
      const idleAnimationPath = this.animationPath('idle');
      return {
        animationSequenceKey: `mascot-sequence-${++nextSequenceKey}`,
        ...(entryAnimationPath ? { entryAnimationDurationMs: path.basename(entryAnimationPath) === 'focus.mp4' ? 6_100 : ENTRY_CLIP_DURATION_MS } : {}),
        ...(entryAnimationPath ? { entryAnimationPath } : {}),
        ...(loopAnimationPath ? { loopAnimationPath } : {}),
        idleAnimationPath,
        ...(entryAnimationPath ? { entryAnimationUrl: `/mascot/${path.basename(entryAnimationPath)}` } : {}),
        ...(loopAnimationPath ? { loopAnimationUrl: `/mascot/${path.basename(loopAnimationPath)}` } : {}),
        idleAnimationUrl: `/mascot/${path.basename(idleAnimationPath)}`,
      };
    },
    /** Traduz o plano exato do reducer sem escolher estado apenas pelo kind da apresentação. */
    sequenceForAnimation(animation) {
      const sequenceKey = `mascot-sequence-${++nextSequenceKey}`;
      if (!animation || animation.reducedMotion) return { animationSequenceKey: sequenceKey, reducedMotion: true };
      const entryState = animation.entry ? STATE_FOR_ANIMATION_ID[animation.entry] : null;
      const loopState = animation.loop ? STATE_FOR_ANIMATION_ID[animation.loop] : null;
      const entryAnimationPath = entryState ? this.animationPath(entryState) : null;
      const loopAnimationPath = loopState ? this.animationPath(loopState) : null;
      const idleAnimationPath = this.animationPath('idle');
      // Uma apresentação com entrada apenas continua no repouso; um ID de loop desconhecido
      // também cai no repouso em vez de tentar resolver um caminho fornecido pelo renderer.
      const finalLoopPath = loopAnimationPath ?? idleAnimationPath;
      return {
        animationSequenceKey: sequenceKey,
        ...(entryAnimationPath ? { entryAnimationDurationMs: path.basename(entryAnimationPath) === 'focus.mp4' ? 6_100 : ENTRY_CLIP_DURATION_MS } : {}),
        ...(entryAnimationPath ? { entryAnimationPath } : {}),
        loopAnimationPath: finalLoopPath,
        idleAnimationPath,
        ...(entryAnimationPath ? { entryAnimationUrl: `/mascot/${path.basename(entryAnimationPath)}` } : {}),
        loopAnimationUrl: `/mascot/${path.basename(finalLoopPath)}`,
        idleAnimationUrl: `/mascot/${path.basename(idleAnimationPath)}`,
      };
    },
  };
}

// Quanto tempo sem nada acontecer até cada estágio do repouso: atento, curioso, dando uma volta, dormindo.
const IDLE_STAGES = Object.freeze([
  { afterMs: 30_000, state: 'curious' },
  { afterMs: 60_000, state: 'wander' },
  { afterMs: 5 * 60_000, state: 'sleep' },
]);
// Os clipes de entrada empacotados têm quatro segundos. Uma margem curta evita cortar o último frame
// enquanto o player conclui o item; o host nativo não repete o clipe de entrada.
const ENTRY_CLIP_DURATION_MS = 4_100;

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

function createMascotAnimationSequencer({ onLoop, setTimer = detachedTimer, clearTimer = clearTimeout } = {}) {
  let timer = null;
  let requestId = null;
  const cancel = (targetRequestId) => {
    if (requestId === null || (targetRequestId !== undefined && targetRequestId !== requestId)) return false;
    clearTimer(timer);
    timer = null;
    requestId = null;
    return true;
  };
  return {
    start({ presentation, delayMs = ENTRY_CLIP_DURATION_MS }) {
      cancel();
      if (!presentation?.requestId || !presentation.entryAnimationPath) return false;
      requestId = presentation.requestId;
      const owner = requestId;
      timer = setTimer(() => {
        if (requestId !== owner) return;
        timer = null;
        requestId = null;
        const loopPath = presentation.loopAnimationPath || presentation.idleAnimationPath;
        onLoop?.({
          ...presentation,
          entryAnimationPath: null,
          entryAnimationUrl: undefined,
          animationPath: loopPath,
          loopAnimationPath: loopPath,
          loopAnimationUrl: presentation.loopAnimationUrl || presentation.idleAnimationUrl,
        });
      }, presentation.entryAnimationDurationMs ?? delayMs);
      return true;
    },
    cancel,
    get activeRequestId() { return requestId; },
  };
}

module.exports = { ANIMATIONS, ENTRY_CLIP_DURATION_MS, IDLE_STAGES, SEQUENCE_FOR_KIND, createIdleEscalation, createMascot, createMascotAnimationSequencer, mascotStateFor };

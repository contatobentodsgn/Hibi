// Presença durante o foco: os ajustes que o Mac consegue honrar (inatividade, ausência, loop visual),
// o que o dispositivo Taby vai honrar (timeout de tela), e as decisões puras que os governam.
//
// POR QUE ESTE MÓDULO EXISTE
// A auditoria do app original achou controles que não governavam comportamento. Estes quatro ajustes
// existiam lá e voltam aqui com uma regra: o que o Mac faz tem que acontecer de verdade, e o que só o
// aparelho faz é guardado e entregue num contrato (`device-settings.mjs`) — nunca fingido.
//
// POR QUE ESM
// Pelo mesmo motivo do portão de foco: este arquivo é lido pelo processo principal (o monitor de
// presença, via `require()` de `.mjs`), pelo Vitest e pelo dev server do Vite no renderer (a decisão
// de ausência e a sanitização dos ajustes). Três pipelines, um arquivo só.
//
// PADRÕES ESCOLHIDOS, NÃO COPIADOS
// A tela de ajustes do original não está na árvore que sobrou dele, então os valores padrão de
// inatividade, ausência e timeout de tela foram ESCOLHIDOS aqui, não copiados:
// - `idleMinutes: 5` — ler um PDF ou pensar num problema passa fácil de 1–2 minutos sem tocar no
//   teclado; com 5 a pergunta raramente interrompe quem está ali, e ainda chega antes de a sessão de
//   25 minutos virar metade ausência.
// - `awayBehavior: 'ask'` — é o `focus.idle_check` do original: perguntar é o único dos três que não
//   decide pela pessoa. Pausar sozinho erra com quem só estava lendo; seguir contando erra com quem saiu.
// - `screenTimeoutSeconds: 60` — o meio da lista: um minuto sem mexer apaga a tela sem obrigar a
//   pessoa a acordar o aparelho a cada olhada rápida.
// Só `focusLoopAnimation: 'focus'` é copiado: é o `DEFAULT_COMPANION_FOCUS_LOOP_PREFERENCE` do original.

export const IDLE_MINUTES = [1, 2, 5, 10, 15];
export const AWAY_BEHAVIORS = ['ask', 'pause', 'keep'];
export const FOCUS_LOOP_ANIMATIONS = ['focus', 'music'];
export const SCREEN_TIMEOUT_SECONDS = [30, 60, 120, 300];

export const DEFAULT_PRESENCE_SETTINGS = Object.freeze({
  idleMinutes: 5,
  awayBehavior: 'ask',
  focusLoopAnimation: 'focus',
  screenTimeoutSeconds: 60,
});

/**
 * Campo a campo, como `sanitizeFocusSettings`: um valor fora da lista cai no padrão. Um backup
 * exportado antes destes ajustes existirem não tem nenhum dos quatro — e restaura com os padrões.
 */
export function sanitizePresenceSettings(value) {
  const input = value && typeof value === 'object' ? value : {};
  return {
    idleMinutes: IDLE_MINUTES.includes(input.idleMinutes) ? input.idleMinutes : DEFAULT_PRESENCE_SETTINGS.idleMinutes,
    awayBehavior: AWAY_BEHAVIORS.includes(input.awayBehavior) ? input.awayBehavior : DEFAULT_PRESENCE_SETTINGS.awayBehavior,
    focusLoopAnimation: FOCUS_LOOP_ANIMATIONS.includes(input.focusLoopAnimation) ? input.focusLoopAnimation : DEFAULT_PRESENCE_SETTINGS.focusLoopAnimation,
    screenTimeoutSeconds: SCREEN_TIMEOUT_SECONDS.includes(input.screenTimeoutSeconds) ? input.screenTimeoutSeconds : DEFAULT_PRESENCE_SETTINGS.screenTimeoutSeconds,
  };
}

/**
 * O loop que o companion toca com a sessão rodando. Mesma regra do `resolveCompanionFocusLoopAnimationId`
 * do original: "music" toca `listening_music_loop`; o resto, o notebook. O original escolhia entre
 * bored/normal/excited pelo humor; o Hibi não mede humor, então fica no `normal`.
 */
export function resolveFocusLoopAnimationId(preference) {
  return preference === 'music' ? 'listening_music_loop' : 'working_laptop_normal_loop';
}

/**
 * O que fazer com uma ausência. Só uma sessão de FOCO RODANDO reage: na pausa de descanso ninguém
 * precisa estar na frente do Mac, e uma sessão já pausada não tem tempo correndo para proteger.
 * Devolve 'ask' (perguntar), 'pause' (pausar sozinho com motivo `away`) ou 'none'.
 */
export function decideAwayResponse({ mode, phase, behavior }) {
  if (mode !== 'focus' || phase !== 'running') return 'none';
  if (behavior === 'ask' || behavior === 'pause') return behavior;
  return 'none';
}

// Intervalo do monitor. O limiar mais curto é 1 minuto: consultando a cada 10 s a ausência é
// percebida no máximo 10 s depois do limiar, e o retorno em até 10 s. `getSystemIdleTime()` é uma
// leitura barata do IOKit, mas acordar a CPU a cada segundo numa bateria não compraria nada que a
// pessoa note. E ele só roda com sessão ativa: fora dela não há intervalo armado.
export const PRESENCE_POLL_MS = 10_000;

// Ausência por energia: tela bloqueada ou Mac dormindo. O retorno exige que as DUAS causas tenham
// passado — ao acordar de um sono com senha, `resume` chega antes de `unlock-screen`, e a pessoa ainda
// está na tela de bloqueio.
export const POWER_AWAY_EVENTS = ['lock-screen', 'suspend'];
export const POWER_RETURN_EVENTS = ['unlock-screen', 'resume'];

export const INITIAL_PRESENCE_STATE = Object.freeze({ away: null, locked: false, suspended: false });

const seconds = (value) => (Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);

/** O pedido do renderer para vigiar a presença, reduzido ao que o monitor aceita. */
export function sanitizePresenceWatch(value) {
  const input = value && typeof value === 'object' ? value : {};
  const idleMinutes = IDLE_MINUTES.includes(input.idleMinutes) ? input.idleMinutes : DEFAULT_PRESENCE_SETTINGS.idleMinutes;
  return { watching: input.watching === true, idleSeconds: idleMinutes * 60 };
}

/**
 * Um passo do monitor. Puro: estado e amostra entram, estado e no máximo um evento saem.
 *
 * `away` guarda desde quando a pessoa está ausente (`sinceMs`), que é o instante em que o teclado e o
 * mouse pararam — não o instante em que o limiar foi cruzado. É isso que o renderer desconta.
 */
export function stepPresence(state, input) {
  const current = state ?? INITIAL_PRESENCE_STATE;
  const nowMs = input.nowMs;
  const idleSeconds = seconds(input.idleSeconds);
  const leave = (reason, next) => ({
    state: { ...next, away: { reason, sinceMs: nowMs - idleSeconds * 1000 } },
    event: { type: 'away', reason, idleSeconds, atMs: nowMs },
  });
  const back = (reason, next) => ({
    state: { ...next, away: null },
    event: { type: 'returned', reason, awaySeconds: Math.max(0, Math.round((nowMs - current.away.sinceMs) / 1000)), atMs: nowMs },
  });

  if (input.kind === 'poll') {
    // Com a tela bloqueada, mexer o mouse na tela de senha zera o tempo ocioso sem que a pessoa tenha
    // voltado ao trabalho. Enquanto a causa for energia, quem decide o retorno é o evento de energia.
    if (current.locked || current.suspended) return { state: current };
    if (!current.away && idleSeconds >= input.thresholdSeconds) return leave('idle', current);
    if (current.away && current.away.reason === 'idle' && idleSeconds < input.thresholdSeconds) return back('idle', current);
    return { state: current };
  }

  if (input.kind === 'power') {
    if (POWER_AWAY_EVENTS.includes(input.event)) {
      const next = { ...current, [input.event === 'lock-screen' ? 'locked' : 'suspended']: true };
      return current.away ? { state: next } : leave('power', next);
    }
    if (POWER_RETURN_EVENTS.includes(input.event)) {
      const next = { ...current, [input.event === 'unlock-screen' ? 'locked' : 'suspended']: false };
      if (current.away && !next.locked && !next.suspended) return back('power', next);
      return { state: next };
    }
  }
  return { state: current };
}

/**
 * O monitor do processo principal. Só existe intervalo e ouvinte de energia enquanto o renderer pede
 * vigia — isto é, com uma sessão de foco rodando (ou pausada por ausência, esperando a volta).
 */
export function createPresenceMonitor({ powerMonitor, onChange = () => undefined, setInterval: setIntervalFn = setInterval, clearInterval: clearIntervalFn = clearInterval, now = () => Date.now(), pollMs = PRESENCE_POLL_MS } = {}) {
  let timer = null;
  let thresholdSeconds = DEFAULT_PRESENCE_SETTINGS.idleMinutes * 60;
  let state = INITIAL_PRESENCE_STATE;

  const idleSeconds = () => {
    try { return seconds(powerMonitor?.getSystemIdleTime?.()); } catch { return 0; }
  };
  const apply = (input) => {
    const step = stepPresence(state, input);
    state = step.state;
    if (step.event) onChange(step.event);
  };
  const poll = () => apply({ kind: 'poll', idleSeconds: idleSeconds(), thresholdSeconds, nowMs: now() });
  const powerListeners = [...POWER_AWAY_EVENTS, ...POWER_RETURN_EVENTS].map((event) => [event, () => apply({ kind: 'power', event, idleSeconds: idleSeconds(), nowMs: now() })]);

  function stop() {
    if (timer === null) return;
    clearIntervalFn(timer);
    timer = null;
    for (const [event, listener] of powerListeners) powerMonitor?.removeListener?.(event, listener);
    // Uma ausência que começou numa sessão encerrada não pertence à próxima.
    state = INITIAL_PRESENCE_STATE;
  }

  function watch(value) {
    const request = sanitizePresenceWatch(value);
    if (!request.watching) { stop(); return { watching: false }; }
    thresholdSeconds = request.idleSeconds;
    if (timer === null) {
      timer = setIntervalFn(poll, pollMs);
      for (const [event, listener] of powerListeners) powerMonitor?.on?.(event, listener);
    }
    return { watching: true };
  }

  return { watch, stop, get watching() { return timer !== null; } };
}

/** O evento que chega ao renderer, conferido de novo deste lado da ponte. */
export function sanitizePresenceEvent(value) {
  if (!value || typeof value !== 'object') return null;
  const reason = value.reason === 'idle' || value.reason === 'power' ? value.reason : null;
  if (!reason || !Number.isFinite(value.atMs)) return null;
  if (value.type === 'away' && Number.isFinite(value.idleSeconds) && value.idleSeconds >= 0) return { type: 'away', reason, idleSeconds: value.idleSeconds, atMs: value.atMs };
  if (value.type === 'returned' && Number.isFinite(value.awaySeconds) && value.awaySeconds >= 0) return { type: 'returned', reason, awaySeconds: value.awaySeconds, atMs: value.atMs };
  return null;
}

/**
 * Desde quando a pessoa estava ausente. Usa o relógio do momento da DETECÇÃO, não o da entrega: um
 * `suspend` só chega ao renderer depois que o Mac acorda, e medir a partir da entrega contaria a
 * noite inteira de sono como foco.
 */
export function absenceStartMs(event) {
  return event.atMs - event.idleSeconds * 1000;
}

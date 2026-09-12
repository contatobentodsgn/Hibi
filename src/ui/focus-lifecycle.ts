export type FocusLifecyclePhase = 'idle' | 'running' | 'paused';
export type FocusLifecycleAction = 'start' | 'pause' | 'complete' | 'abandon';

export interface FocusLifecycleState {
  phase: FocusLifecyclePhase;
  accumulatedMs: number;
  runningSince?: number;
  /** Duração da sessão: o tempo medido nunca passa dela. */
  limitMs?: number;
}

export interface FocusLifecycleEvent {
  type: 'started' | 'paused' | 'resumed' | 'completed' | 'cancelled';
  focusedMinutes?: number;
  /**
   * Quando esta sessão termina, em tempo absoluto. É a janela que o agendador precisa para segurar os
   * lembretes de bem-estar (ver electron/focus-gate.mjs). Sai daqui porque é aqui que a duração e o
   * tempo já medido moram — um segundo relógio em outro lugar poderia discordar deste.
   */
  endsAtMs?: number;
}

export interface FocusLifecycleStep {
  state: FocusLifecycleState;
  event?: FocusLifecycleEvent;
}

export const IDLE_FOCUS_LIFECYCLE: FocusLifecycleState = Object.freeze({ phase: 'idle', accumulatedMs: 0 });

// Relógio que volta no tempo não pode descontar minutos já medidos.
const elapsedMs = (state: FocusLifecycleState, nowMs: number) => state.phase === 'running' && state.runningSince !== undefined ? Math.max(0, nowMs - state.runningSince) : 0;
// Com o notebook dormindo ou a janela estrangulada, Date.now() avança e a contagem regressiva não:
// o tempo medido para na duração da sessão.
const measuredMs = (state: FocusLifecycleState, nowMs: number) => {
  const total = state.accumulatedMs + elapsedMs(state, nowMs);
  return state.limitMs === undefined ? total : Math.min(state.limitMs, total);
};
const focusedMinutes = (state: FocusLifecycleState, nowMs: number) => Math.max(0, Math.round(measuredMs(state, nowMs) / 60_000));
const withLimit = (limitMs: number | undefined) => (limitMs !== undefined && Number.isFinite(limitMs) && limitMs >= 0 ? { limitMs } : {});

// O fim previsto da sessão: agora mais o que falta medir. Numa retomada desconta o tempo já medido,
// para o lembrete retido não esperar a duração inteira de novo.
const endsAt = (nowMs: number, limitMs: number | undefined, accumulatedMs: number) =>
  limitMs === undefined || !Number.isFinite(limitMs) ? {} : { endsAtMs: nowMs + Math.max(0, limitMs - accumulatedMs) };

export function startFocus(state: FocusLifecycleState, nowMs: number, limitMs: number): FocusLifecycleStep {
  if (state.phase === 'running') return { state };
  const resuming = state.phase === 'paused';
  // A retomada mantém a duração com que a sessão começou.
  const sessionLimitMs = resuming ? state.limitMs : limitMs;
  const measuredMs = resuming ? state.accumulatedMs : 0;
  return {
    state: { phase: 'running', accumulatedMs: measuredMs, runningSince: nowMs, ...withLimit(sessionLimitMs) },
    event: { type: resuming ? 'resumed' : 'started', ...endsAt(nowMs, sessionLimitMs, measuredMs) },
  };
}

export function pauseFocus(state: FocusLifecycleState, nowMs: number): FocusLifecycleStep {
  if (state.phase !== 'running') return { state };
  return { state: { phase: 'paused', accumulatedMs: measuredMs(state, nowMs), ...withLimit(state.limitMs) }, event: { type: 'paused' } };
}

export function completeFocus(state: FocusLifecycleState, nowMs: number): FocusLifecycleStep {
  if (state.phase === 'idle') return { state };
  return { state: IDLE_FOCUS_LIFECYCLE, event: { type: 'completed', focusedMinutes: focusedMinutes(state, nowMs) } };
}

export function abandonFocus(state: FocusLifecycleState, nowMs: number): FocusLifecycleStep {
  if (state.phase === 'idle') return { state };
  return { state: IDLE_FOCUS_LIFECYCLE, event: { type: 'cancelled', focusedMinutes: focusedMinutes(state, nowMs) } };
}

// Pausas usam o mesmo relógio do foco, mas nunca viram atividade de foco.
export function stepFocusLifecycle(mode: 'focus' | 'break', action: FocusLifecycleAction, state: FocusLifecycleState, nowMs: number, limitMs: number): FocusLifecycleStep {
  if (mode === 'break') return { state: IDLE_FOCUS_LIFECYCLE };
  switch (action) {
    case 'start': return startFocus(state, nowMs, limitMs);
    case 'pause': return pauseFocus(state, nowMs);
    case 'complete': return completeFocus(state, nowMs);
    case 'abandon': return abandonFocus(state, nowMs);
  }
}

// Clicar na duração já escolhida com a sessão pausada não pode zerar o relógio nem abandonar a sessão;
// outra duração continua recomeçando. Com o relógio intacto, reaplicar a mesma duração não perde nada.
// Pausas não geram registro de atividade (não há progresso de foco a proteger), então o guard nunca
// se aplica em modo break: lá, escolher a duração já selecionada sempre reinicia o relógio.
export function ignoresDurationChoice(choice: Readonly<{ mode: 'focus' | 'break'; running: boolean; paused: boolean; selectedMinutes: number; nextMinutes: number }>): boolean {
  return choice.mode === 'focus' && (choice.running || (choice.paused && choice.nextMinutes === choice.selectedMinutes));
}

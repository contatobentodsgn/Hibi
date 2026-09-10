export type FocusLifecyclePhase = 'idle' | 'running' | 'paused';
export type FocusLifecycleAction = 'start' | 'pause' | 'complete' | 'abandon';

export interface FocusLifecycleState {
  phase: FocusLifecyclePhase;
  accumulatedMs: number;
  runningSince?: number;
}

export interface FocusLifecycleEvent {
  type: 'started' | 'paused' | 'resumed' | 'completed' | 'cancelled';
  focusedMinutes?: number;
}

export interface FocusLifecycleStep {
  state: FocusLifecycleState;
  event?: FocusLifecycleEvent;
}

export const IDLE_FOCUS_LIFECYCLE: FocusLifecycleState = Object.freeze({ phase: 'idle', accumulatedMs: 0 });

// Relógio que volta no tempo não pode descontar minutos já medidos.
const elapsedMs = (state: FocusLifecycleState, nowMs: number) => state.phase === 'running' && state.runningSince !== undefined ? Math.max(0, nowMs - state.runningSince) : 0;
const focusedMinutes = (state: FocusLifecycleState, nowMs: number) => Math.max(0, Math.round((state.accumulatedMs + elapsedMs(state, nowMs)) / 60_000));

export function start(state: FocusLifecycleState, nowMs: number): FocusLifecycleStep {
  if (state.phase === 'running') return { state };
  const resuming = state.phase === 'paused';
  return { state: { phase: 'running', accumulatedMs: resuming ? state.accumulatedMs : 0, runningSince: nowMs }, event: { type: resuming ? 'resumed' : 'started' } };
}

export function pause(state: FocusLifecycleState, nowMs: number): FocusLifecycleStep {
  if (state.phase !== 'running') return { state };
  return { state: { phase: 'paused', accumulatedMs: state.accumulatedMs + elapsedMs(state, nowMs) }, event: { type: 'paused' } };
}

export function complete(state: FocusLifecycleState, nowMs: number): FocusLifecycleStep {
  if (state.phase === 'idle') return { state };
  return { state: IDLE_FOCUS_LIFECYCLE, event: { type: 'completed', focusedMinutes: focusedMinutes(state, nowMs) } };
}

export function abandon(state: FocusLifecycleState, nowMs: number): FocusLifecycleStep {
  if (state.phase === 'idle') return { state };
  return { state: IDLE_FOCUS_LIFECYCLE, event: { type: 'cancelled', focusedMinutes: focusedMinutes(state, nowMs) } };
}

const ACTIONS = { start, pause, complete, abandon } as const;

// Pausas usam o mesmo relógio do foco, mas nunca viram atividade de foco.
export function stepFocusLifecycle(mode: 'focus' | 'break', action: FocusLifecycleAction, state: FocusLifecycleState, nowMs: number): FocusLifecycleStep {
  if (mode === 'break') return { state: IDLE_FOCUS_LIFECYCLE };
  return ACTIONS[action](state, nowMs);
}

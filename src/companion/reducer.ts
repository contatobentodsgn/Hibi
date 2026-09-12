import type { CompanionAction, CompanionAnimation, CompanionEvent, CompanionKind, CompanionPresentation } from './contracts';
import { resolveFocusLoopAnimationId, type FocusLoopAnimation, type FocusMood } from '../../electron/focus-presence.mjs';

export type { CompanionAction, CompanionAnimation, CompanionEvent, CompanionKind, CompanionPresentation } from './contracts';

const idleAnimation: CompanionAnimation = { entry: null, loop: 'idle_01_loop', reducedMotion: false };

export const initialCompanionState: CompanionPresentation = Object.freeze({
  requestId: null,
  kind: 'idle',
  priority: 0,
  animation: idleAnimation,
  text: null,
  actions: [],
  interaction: 'passthrough',
  expiresAtMs: null,
});

const priorityFor = (kind: CompanionKind): number => ({
  hidden: 0,
  idle: 0,
  focus: 20,
  acting: 40,
  result: 50,
  reminder: 60,
  listening: 70,
  thinking: 70,
  confirmation: 100,
  error: 100,
})[kind];

const animationFor = (kind: CompanionKind, reducedMotion: boolean, reminderAnimation?: string, focusLoop?: FocusLoopAnimation, focusMood?: FocusMood): CompanionAnimation => {
  const normal: Record<CompanionKind, Omit<CompanionAnimation, 'reducedMotion'>> = {
    hidden: { entry: null, loop: null },
    idle: { entry: null, loop: 'idle_01_loop' },
    listening: { entry: 'listening_in', loop: 'listening_loop' },
    thinking: { entry: null, loop: 'searching_loop' },
    acting: { entry: null, loop: 'creating_task_loop' },
    confirmation: { entry: 'confirmation', loop: null },
    result: { entry: 'taby_response_ready_in', loop: 'taby_response_ready_loop' },
    // O loop do foco é o ajuste "Animação durante o foco" no humor do momento, pela mesma regra da tela de Foco.
    focus: { entry: focusLoop === 'music' ? null : 'working_laptop_in', loop: resolveFocusLoopAnimationId(focusLoop, focusMood) },
    reminder: { entry: reminderAnimation ?? 'waiting_01', loop: null },
    error: { entry: 'disappointed', loop: null },
  };
  const animation = normal[kind];
  if (!reducedMotion) return { ...animation, reducedMotion: false };
  return { entry: null, loop: null, staticFrame: animation.loop ?? animation.entry ?? 'idle_01_loop', reducedMotion: true };
};

const expiryAt = (nowMs: number, expiresInMs?: number): number | null =>
  typeof expiresInMs === 'number' && Number.isFinite(expiresInMs) && expiresInMs >= 0 ? nowMs + expiresInMs : null;

const presentation = (
  kind: CompanionKind,
  event: Extract<CompanionEvent, { requestId: string; nowMs: number }>,
  actions: readonly CompanionAction[] = [],
  reminderAnimation?: string,
  focusLoop?: FocusLoopAnimation,
  focusMood?: FocusMood,
): CompanionPresentation => ({
  requestId: event.requestId,
  kind,
  priority: priorityFor(kind),
  animation: animationFor(kind, event.reducedMotion === true, reminderAnimation, focusLoop, focusMood),
  text: event.text ?? null,
  actions,
  interaction: actions.length > 0 ? 'capture' : 'passthrough',
  expiresAtMs: expiryAt(event.nowMs, event.expiresInMs),
});

const canReplace = (state: CompanionPresentation, candidate: CompanionPresentation): boolean =>
  state.requestId === null || state.requestId === candidate.requestId || candidate.priority >= state.priority;

export function reduceCompanion(state: CompanionPresentation, event: CompanionEvent): CompanionPresentation {
  switch (event.type) {
    case 'time.elapsed':
      return state.expiresAtMs !== null && event.nowMs >= state.expiresAtMs ? initialCompanionState : state;
    case 'presentation.dismissed':
    case 'animation.ended':
      return state.requestId === event.requestId ? initialCompanionState : state;
    case 'ai.stage': {
      const candidate = presentation(event.stage, event);
      return canReplace(state, candidate) ? candidate : state;
    }
    case 'ai.result': {
      const candidate = presentation('result', event);
      return canReplace(state, candidate) ? candidate : state;
    }
    case 'confirmation.requested': {
      const candidate = presentation('confirmation', event, event.actions);
      return canReplace(state, candidate) ? candidate : state;
    }
    case 'focus.started': {
      const candidate = presentation('focus', event, [], undefined, event.focusLoopAnimation, event.focusMood);
      return canReplace(state, candidate) ? candidate : state;
    }
    // As duas perguntas de presença têm botões, então capturam o ponteiro como uma confirmação.
    case 'focus.idle_check':
    case 'focus.resume_prompt': {
      const candidate = presentation('confirmation', event, event.actions);
      return canReplace(state, candidate) ? candidate : state;
    }
    case 'focus.completed': {
      const candidate = presentation('result', event);
      return canReplace(state, candidate) ? candidate : state;
    }
    case 'reminder.triggered': {
      const candidate = presentation('reminder', event, event.actions ?? [], event.animationId);
      return canReplace(state, candidate) ? candidate : state;
    }
    case 'error.raised': {
      const candidate = presentation('error', event, event.actions ?? []);
      return canReplace(state, candidate) ? candidate : state;
    }
    case 'task.completed': {
      const candidate = presentation('result', event);
      return canReplace(state, candidate) ? candidate : state;
    }
  }
}

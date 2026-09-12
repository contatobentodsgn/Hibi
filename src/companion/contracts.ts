import type { FocusMood } from '../../electron/focus-presence.mjs';

export type CompanionKind =
  | 'hidden'
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'acting'
  | 'confirmation'
  | 'result'
  | 'focus'
  | 'reminder'
  | 'error';

export type CompanionInteraction = 'passthrough' | 'capture';

export type CompanionAction = Readonly<{ id: string; label: string }>;

export type CompanionAnimation = Readonly<{
  entry: string | null;
  loop: string | null;
  staticFrame?: string;
  reducedMotion: boolean;
}>;

export type CompanionPresentation = Readonly<{
  requestId: string | null;
  kind: CompanionKind;
  priority: number;
  animation: CompanionAnimation;
  text: string | null;
  actions: readonly CompanionAction[];
  interaction: CompanionInteraction;
  expiresAtMs: number | null;
}>;

export type CompanionAiStage = 'listening' | 'thinking' | 'acting';

type PresentationEvent = Readonly<{
  requestId: string;
  text?: string;
  nowMs: number;
  expiresInMs?: number;
  reducedMotion?: boolean;
}>;

export type CompanionEvent =
  | (PresentationEvent & { type: 'ai.stage'; stage: CompanionAiStage })
  | (PresentationEvent & { type: 'ai.result' })
  | (PresentationEvent & { type: 'confirmation.requested'; actions: readonly CompanionAction[] })
  // `focusMood` é de runtime: escolhe entre os loops do notebook; com "music" o loop de música toca igual.
  | (PresentationEvent & { type: 'focus.started'; focusLoopAnimation?: 'focus' | 'music'; focusMood?: FocusMood })
  // O `focus.idle_check` do original: com a sessão rodando e ninguém no Mac, o companion pergunta.
  | (PresentationEvent & { type: 'focus.idle_check'; actions: readonly CompanionAction[] })
  // O `focus.resume_prompt` do original: na volta de uma pausa por ausência, oferece retomar.
  | (PresentationEvent & { type: 'focus.resume_prompt'; pauseReason: 'away' | 'manual'; actions: readonly CompanionAction[] })
  | (PresentationEvent & { type: 'focus.completed' })
  | (PresentationEvent & { type: 'reminder.triggered'; actions?: readonly CompanionAction[]; animationId?: string })
  | (PresentationEvent & { type: 'error.raised'; actions?: readonly CompanionAction[] })
  | (PresentationEvent & { type: 'task.completed' })
  | Readonly<{ type: 'presentation.dismissed' | 'animation.ended'; requestId: string }>
  | Readonly<{ type: 'time.elapsed'; nowMs: number }>;

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
  | (PresentationEvent & { type: 'focus.started' })
  | (PresentationEvent & { type: 'reminder.triggered'; actions?: readonly CompanionAction[]; animationId?: string })
  | (PresentationEvent & { type: 'error.raised'; actions?: readonly CompanionAction[] })
  | (PresentationEvent & { type: 'task.completed' })
  | Readonly<{ type: 'presentation.dismissed' | 'animation.ended'; requestId: string }>
  | Readonly<{ type: 'time.elapsed'; nowMs: number }>;

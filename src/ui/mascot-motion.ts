import type { MascotAnimationState } from './mascot-animation';

/** Repouso progressivo alinhado aos estágios do mascote persistente no notch. */
export const IDLE_MASCOT_STAGES = [
  { afterMs: 0, animation: 'idle' },
  { afterMs: 30_000, animation: 'idle-curious' },
  { afterMs: 60_000, animation: 'idle-wander' },
  { afterMs: 300_000, animation: 'idle-sleep' },
] as const satisfies readonly { afterMs: number; animation: MascotAnimationState }[];

export function idleMascotAnimationAt(elapsedMs: number): MascotAnimationState {
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  for (let index = IDLE_MASCOT_STAGES.length - 1; index >= 0; index -= 1) {
    const stage = IDLE_MASCOT_STAGES[index]!;
    if (elapsed >= stage.afterMs) return stage.animation;
  }
  return 'idle';
}

export function nextIdleMascotStageIn(elapsedMs: number): number | null {
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const next = IDLE_MASCOT_STAGES.find((stage) => stage.afterMs > elapsed);
  return next ? next.afterMs - elapsed : null;
}

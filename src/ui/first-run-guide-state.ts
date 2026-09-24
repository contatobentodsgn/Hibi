export type FirstRunGuideState = Readonly<{
  status: 'in-progress' | 'deferred' | 'completed';
  step: number;
  taskBaseline?: number;
}>;

export const FIRST_RUN_GUIDE_STORAGE_KEY = 'pixano-first-run-guide.v1';
export const FIRST_RUN_GUIDE_STEP_COUNT = 5;
export const initialGuideState: FirstRunGuideState = { status: 'in-progress', step: 0 };

export function readGuideState(serialized: string | null): FirstRunGuideState {
  if (!serialized) return initialGuideState;
  try {
    const value: unknown = JSON.parse(serialized);
    if (typeof value !== 'object' || value === null) return initialGuideState;
    const candidate = value as { status?: unknown; step?: unknown };
    if (!Number.isInteger(candidate.step) || (candidate.step as number) < 0 || (candidate.step as number) >= FIRST_RUN_GUIDE_STEP_COUNT) return initialGuideState;
    if (candidate.status !== 'in-progress' && candidate.status !== 'deferred' && candidate.status !== 'completed') return initialGuideState;
    const taskBaseline = Number.isInteger((candidate as { taskBaseline?: unknown }).taskBaseline) && ((candidate as { taskBaseline: number }).taskBaseline >= 0)
      ? (candidate as { taskBaseline: number }).taskBaseline
      : undefined;
    return { status: candidate.status, step: candidate.step as number, ...(taskBaseline === undefined ? {} : { taskBaseline }) };
  } catch {
    return initialGuideState;
  }
}

export const nextGuideStep = (state: FirstRunGuideState): FirstRunGuideState => ({ status: 'in-progress', step: Math.min(state.step + 1, FIRST_RUN_GUIDE_STEP_COUNT - 1) });
export const deferGuide = (state: FirstRunGuideState): FirstRunGuideState => ({ ...state, status: 'deferred' });
export const resumeGuide = (state: FirstRunGuideState): FirstRunGuideState => ({ ...state, status: 'in-progress' });
export const completeGuide = (state: FirstRunGuideState): FirstRunGuideState => ({ ...state, status: 'completed' });

import { describe, expect, it } from 'vitest';
import { completeGuide, deferGuide, initialGuideState, nextGuideStep, readGuideState, resumeGuide } from './first-run-guide-state';

describe('first run guide state', () => {
  it('keeps the current step when deferred and resumed', () => {
    const atVoiceStep = nextGuideStep(nextGuideStep(initialGuideState));
    expect(resumeGuide(deferGuide(atVoiceStep))).toEqual(atVoiceStep);
  });

  it('only completes when an explicit completion action happens', () => {
    expect(completeGuide({ status: 'in-progress', step: 4 })).toEqual({ status: 'completed', step: 4 });
    expect(nextGuideStep({ status: 'in-progress', step: 3 })).toEqual({ status: 'in-progress', step: 4 });
  });

  it('recovers safely from malformed saved data', () => {
    expect(readGuideState('{"status":"completed","step":900}')).toEqual(initialGuideState);
    expect(readGuideState('{')).toEqual(initialGuideState);
  });
});

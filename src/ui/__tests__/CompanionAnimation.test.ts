import { describe, expect, it } from 'vitest';
import { companionAnimationForState } from '../CompanionAnimation';

describe('companion animation states', () => {
  it('resolves every semantic state from the typed asset registry', () => {
    expect(companionAnimationForState('working')).toEqual({
      kind: 'video',
      url: '/companion-assets/animations/notch/working_loop.mp4',
      id: 'animations.notch.workingLoop',
      label: 'Working Loop',
    });
    expect(companionAnimationForState('idle')).toMatchObject({ url: expect.stringContaining('idle_01_loop.mp4') });
    expect(companionAnimationForState('completed')).toMatchObject({ url: expect.stringContaining('task_completed.mp4') });
    expect(companionAnimationForState('reminder')).toMatchObject({ url: expect.stringContaining('waiting_01.mp4') });
  });

  it('returns a reduced-motion fallback without selecting media', () => {
    expect(companionAnimationForState('working', true)).toEqual({ kind: 'fallback', symbol: '●' });
    expect(companionAnimationForState('completed', true)).toEqual({ kind: 'fallback', symbol: '✓' });
  });
});

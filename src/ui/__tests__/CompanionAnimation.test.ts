import { describe, expect, it } from 'vitest';
import { companionAnimationForState } from '../CompanionAnimation';

describe('companion animation states', () => {
  it('uses only Pixano cat mascot clips for the visible states', () => {
    expect(companionAnimationForState('working')).toEqual({ kind: 'video', url: '/mascot/focus.mp4' });
    expect(companionAnimationForState('idle')).toEqual({ kind: 'video', url: '/mascot/idle.mp4' });
    expect(companionAnimationForState('completed')).toEqual({ kind: 'video', url: '/mascot/happy_1.mp4' });
    expect(companionAnimationForState('reminder')).toEqual({ kind: 'video', url: '/mascot/listening.mp4' });
    expect(companionAnimationForState('working_laptop_bored_loop')).toEqual({ kind: 'video', url: '/mascot/idle_curious.mp4' });
    expect(companionAnimationForState('working_laptop_normal_loop')).toEqual({ kind: 'video', url: '/mascot/focus.mp4' });
    expect(companionAnimationForState('working_laptop_excited_loop')).toEqual({ kind: 'video', url: '/mascot/happy_2.mp4' });
    expect(companionAnimationForState('listening_music_loop')).toEqual({ kind: 'video', url: '/mascot/listening.mp4' });
  });

  it('returns a reduced-motion fallback without selecting media', () => {
    expect(companionAnimationForState('working', true)).toEqual({ kind: 'fallback', symbol: '●' });
    expect(companionAnimationForState('completed', true)).toEqual({ kind: 'fallback', symbol: '✓' });
  });
});

import { describe, expect, it } from 'vitest';
import { companionAnimationForState } from '../CompanionAnimation';
import { mascotAnimationFor } from '../mascot-animation';
import { idleMascotAnimationAt, nextIdleMascotStageIn } from '../mascot-motion';

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

  it('varies the idle animation with elapsed rest time, matching the companion stages', () => {
    expect(companionAnimationForState('idle', false, 0)).toEqual({ kind: 'video', url: '/mascot/idle.mp4' });
    expect(companionAnimationForState('idle', false, 30_000)).toEqual({ kind: 'video', url: '/mascot/idle_curious.mp4' });
    expect(companionAnimationForState('idle', false, 60_000)).toEqual({ kind: 'video', url: '/mascot/idle_wander.mp4' });
    expect(companionAnimationForState('idle', false, 300_000)).toEqual({ kind: 'video', url: '/mascot/sleep.mp4' });
    expect(mascotAnimationFor('idle-wander').url).toBe('/mascot/idle_wander.mp4');
    expect(idleMascotAnimationAt(-1)).toBe('idle');
    expect(idleMascotAnimationAt(59_999)).toBe('idle-curious');
    expect(idleMascotAnimationAt(60_000)).toBe('idle-wander');
    expect(idleMascotAnimationAt(300_000)).toBe('idle-sleep');
    expect(nextIdleMascotStageIn(30_000)).toBe(30_000);
    expect(nextIdleMascotStageIn(300_000)).toBeNull();
  });
});

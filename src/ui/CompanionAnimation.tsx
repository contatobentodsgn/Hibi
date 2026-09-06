import React, { useSyncExternalStore } from 'react';
import { companionAssets } from '../assets/companion-assets';

export type CompanionState = 'working' | 'idle' | 'completed' | 'reminder';
type CompanionVideo = { readonly kind: 'video'; readonly url: string };
const stateAssets = {
  working: companionAssets.animations.notch.workingLoop,
  idle: companionAssets.animations.notch.idle01Loop,
  completed: companionAssets.animations.notch.taskCompleted,
  reminder: companionAssets.animations.notch.waiting01,
} satisfies Record<CompanionState, CompanionVideo>;
type Fallback = { kind: 'fallback'; symbol: string };
export type CompanionAnimationSource = CompanionVideo | Fallback;
const fallbackSymbols: Record<CompanionState, string> = { working: '●', idle: '○', completed: '✓', reminder: '!' };

export function companionAnimationForState(state: CompanionState, reducedMotion = false): CompanionAnimationSource {
  return reducedMotion ? { kind: 'fallback', symbol: fallbackSymbols[state] } : stateAssets[state];
}

const motionQuery = '(prefers-reduced-motion: reduce)';
const subscribeToMotionPreference = (onChange: () => void) => {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
  const query = window.matchMedia(motionQuery);
  query.addEventListener?.('change', onChange);
  return () => query.removeEventListener?.('change', onChange);
};
const getMotionPreference = () => typeof window !== 'undefined' && window.matchMedia?.(motionQuery).matches === true;

export function CompanionAnimation({ state, label = 'Companion animation' }: { state: CompanionState; label?: string }) {
  const reducedMotion = useSyncExternalStore(subscribeToMotionPreference, getMotionPreference, () => true);
  const source = companionAnimationForState(state, reducedMotion);
  return <div className="companion-animation" aria-label={label} style={{ width: 96, height: 72, margin: '18px auto 0', display: 'grid', placeItems: 'center', overflow: 'hidden', borderRadius: 18, background: '#171717' }}>
    {source.kind === 'video' ? <video className="companion-animation-video" src={source.url} autoPlay muted loop playsInline aria-hidden="true" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span className="companion-animation-fallback" aria-hidden="true">{source.symbol}</span>}
  </div>;
}

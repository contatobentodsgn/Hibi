import React, { useSyncExternalStore } from 'react';
import { mascotAnimationFor } from './mascot-animation';

import type { FocusLoopAnimationId } from '../../electron/focus-presence.mjs';

// Os loops do foco entram pelo id que `resolveFocusLoopAnimationId` devolve: a tela de Foco não escolhe o
// vídeo por conta própria, pergunta à mesma regra (preferência e humor) que o reducer do companion usa.
export type CompanionState = 'working' | 'idle' | 'completed' | 'reminder' | FocusLoopAnimationId;
type CompanionVideo = { readonly kind: 'video'; readonly url: string };
const stateAssets = {
  working: mascotAnimationFor('working'),
  idle: mascotAnimationFor('idle'),
  completed: mascotAnimationFor('completed'),
  reminder: mascotAnimationFor('reminder'),
  working_laptop_bored_loop: mascotAnimationFor('focus-bored'),
  working_laptop_normal_loop: mascotAnimationFor('focus-normal'),
  working_laptop_excited_loop: mascotAnimationFor('focus-excited'),
  listening_music_loop: mascotAnimationFor('focus-music'),
} satisfies Record<CompanionState, CompanionVideo>;
type Fallback = { kind: 'fallback'; symbol: string };
export type CompanionAnimationSource = CompanionVideo | Fallback;
const fallbackSymbols: Record<CompanionState, string> = { working: '●', idle: '○', completed: '✓', reminder: '!', working_laptop_bored_loop: '●', working_laptop_normal_loop: '●', working_laptop_excited_loop: '●', listening_music_loop: '♪' };

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

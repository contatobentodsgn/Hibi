import React from 'react';

const clips = { working: '/companion-assets/animations/notch/working_loop.mp4', idle: '/companion-assets/animations/notch/idle_loop.mp4' } as const;
type Props = { state: keyof typeof clips; label?: string };
export function CompanionAnimation({ state, label = 'Companion animation' }: Props) {
  return <div className="companion-animation" aria-label={label} style={{ width: 96, height: 72, margin: '18px auto 0', display: 'grid', placeItems: 'center', overflow: 'hidden', borderRadius: 18, background: '#171717' }}><video className="companion-animation-video" src={clips[state]} autoPlay muted loop playsInline aria-hidden="true" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /><span className="companion-animation-fallback" aria-hidden="true">{state === 'working' ? '●' : '○'}</span></div>;
}

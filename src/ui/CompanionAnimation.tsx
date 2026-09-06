import React from 'react';

const clips = { working: '/companion-assets/animations/notch/working_loop.mp4', idle: '/companion-assets/animations/notch/idle_loop.mp4' } as const;
type Props = { state: keyof typeof clips; label?: string };
export function CompanionAnimation({ state, label = 'Companion animation' }: Props) {
  return <div className="companion-animation" aria-label={label}><video className="companion-animation-video" src={clips[state]} autoPlay muted loop playsInline aria-hidden="true" /><span className="companion-animation-fallback" aria-hidden="true">{state === 'working' ? '●' : '○'}</span></div>;
}

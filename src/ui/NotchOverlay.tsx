import React, { useEffect, useState } from 'react';
import { companionAssets } from '../assets/companion-assets';
import './notch-overlay.css';

export type OverlayPresentation = { requestId: string; kind: string; text: string | null; actions: readonly { id: string; label: string }[]; interaction: 'passthrough' | 'capture' };
export const notchMediaFor = (kind: string) => ({ listening: companionAssets.animations.notch.listeningLoop, thinking: companionAssets.animations.notch.searchingLoop, acting: companionAssets.animations.notch.creatingTaskLoop, result: companionAssets.animations.notch.tabyResponseReadyLoop, confirmation: companionAssets.animations.notch.confirmation, error: companionAssets.animations.notch.disappointed, reminder: companionAssets.animations.notch.waiting01 } as const)[kind as 'listening'] ?? companionAssets.animations.notch.idle01Loop;

export function NotchOverlay({ initialPresentation = null }: { initialPresentation?: OverlayPresentation | null }) {
  const [presentation, setPresentation] = useState<OverlayPresentation | null>(initialPresentation);
  useEffect(() => window.hibiDesktop?.onCompanionPresentation?.(setPresentation) ?? (() => undefined), []);
  useEffect(() => { if (!presentation) return; const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && presentation.actions.length === 0) void window.hibiDesktop?.hideNotch?.(presentation.requestId); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [presentation]);
  if (!presentation) return <main className="notch-overlay" aria-live="polite" />;
  const media = notchMediaFor(presentation.kind);
  return <main className="notch-overlay" role={presentation.actions.length ? 'dialog' : 'status'} aria-label={presentation.kind} data-interaction={presentation.interaction}>
    <video src={media.url} autoPlay muted loop playsInline aria-hidden="true" />
    {presentation.text && <p>{presentation.text}</p>}
    {presentation.actions.map((action) => <button type="button" key={action.id} onClick={() => { if (action.id === 'confirm' || action.id === 'cancel') void window.hibiDesktop?.resolveNotchAction?.(presentation.requestId, action.id); }}>{action.label}</button>)}
  </main>;
}

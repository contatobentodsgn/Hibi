import React, { useEffect, useState } from 'react';
import { companionAssets } from '../assets/companion-assets';
import './notch-overlay.css';

export type OverlayPresentation = { requestId: string; kind: string; text: string | null; actions: readonly { id: string; label: string }[]; interaction: 'passthrough' | 'capture' };
export const notchMediaFor = (kind: string) => ({ listening: companionAssets.animations.notch.listeningLoop, thinking: companionAssets.animations.notch.searchingLoop, acting: companionAssets.animations.notch.creatingTaskLoop, result: companionAssets.animations.notch.tabyResponseReadyLoop, confirmation: companionAssets.animations.notch.confirmation, error: companionAssets.animations.notch.disappointed, reminder: companionAssets.animations.notch.waiting01 } as const)[kind as 'listening'] ?? companionAssets.animations.notch.idle01Loop;

export function NotchOverlay({ initialPresentation = null }: { initialPresentation?: OverlayPresentation | null }) {
  const [presentation, setPresentation] = useState<OverlayPresentation | null>(initialPresentation);
  useEffect(() => {
    const unsubscribe = window.hibiDesktop?.onCompanionPresentation?.(setPresentation) ?? (() => undefined);
    // A primeira apresentação é enviada enquanto esta janela ainda carrega e se perde. Buscar a
    // ativa ao montar fecha essa corrida; um envio que chegue depois continua valendo.
    void window.hibiDesktop?.getNotchPresentation?.().then((current) => { if (current) setPresentation((existing) => existing ?? current); }).catch(() => undefined);
    return unsubscribe;
  }, []);
  useEffect(() => { if (!presentation) return; const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && presentation.actions.length === 0) void window.hibiDesktop?.hideNotch?.(presentation.requestId); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [presentation]);
  if (!presentation) return <main className="notch-overlay" aria-live="polite" />;
  const media = notchMediaFor(presentation.kind);
  const interactive = presentation.actions.length > 0;
  return <main className="notch-overlay" role={interactive ? 'dialog' : 'status'} aria-modal={interactive || undefined} aria-live={interactive ? undefined : 'polite'} aria-label={interactive ? 'Hibi confirmation' : `Hibi ${presentation.kind}`} data-interaction={presentation.interaction}>
    <video src={media.url} autoPlay muted loop playsInline aria-hidden="true" />
    {presentation.text && <p>{presentation.text}</p>}
    {presentation.actions.length > 0 && <div className="notch-overlay-actions">
      {presentation.actions.map((action, index) => <button type="button" autoFocus={index === 0} key={action.id} onClick={() => { if (action.id === 'confirm' || action.id === 'cancel') void window.hibiDesktop?.resolveNotchAction?.(presentation.requestId, action.id); }}>{action.label}</button>)}
    </div>}
  </main>;
}

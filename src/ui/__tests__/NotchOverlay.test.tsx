import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NotchOverlay, notchMediaFor } from '../NotchOverlay';
import { readFileSync } from 'node:fs';

describe('NotchOverlay', () => {
  it('uses only Pixano cat mascot clips and has an accessible dormant surface', () => {
    expect(notchMediaFor('thinking').url).toBe('/mascot/idle_curious.mp4');
    expect(notchMediaFor('confirmation').url).toBe('/mascot/listening.mp4');
    expect(notchMediaFor('result').url).toBe('/mascot/happy_1.mp4');
    expect(notchMediaFor('unrecognised').url).toBe('/mascot/idle.mp4');
    expect(renderToStaticMarkup(<NotchOverlay />)).toContain('aria-live="polite"');
  });

  it('renders a labelled confirmation card with explicit actions', () => {
    const markup = renderToStaticMarkup(<NotchOverlay initialPresentation={{ requestId: 'confirm-1', kind: 'confirmation', text: 'Criar tarefa?', interaction: 'capture', actions: [{ id: 'confirm', label: 'Confirmar' }, { id: 'cancel', label: 'Cancelar' }] }} />);
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('aria-label="Pixano confirmation"');
    expect(markup).toContain('autofocus');
    expect(markup).toContain('Confirmar');
    expect(markup).toContain('Cancelar');
  });

  it('starts the semantic entry clip once and carries explicit loop and idle fallbacks', () => {
    const markup = renderToStaticMarkup(<NotchOverlay initialPresentation={{
      requestId: 'animation-1', kind: 'listening', text: null, interaction: 'passthrough', actions: [],
      entryAnimationUrl: '/mascot/idle_curious.mp4', loopAnimationUrl: '/mascot/listening.mp4', idleAnimationUrl: '/mascot/idle.mp4',
    }} />);
    expect(markup).toContain('src="/mascot/idle_curious.mp4"');
    expect(markup).not.toContain(' loop=""');
  });

  it('does not render an animated clip when the companion requests reduced motion', () => {
    const markup = renderToStaticMarkup(<NotchOverlay initialPresentation={{
      requestId: 'reduced-1', kind: 'listening', text: null, interaction: 'passthrough', actions: [],
      reducedMotion: true, entryAnimationUrl: '/mascot/idle_curious.mp4', loopAnimationUrl: '/mascot/listening.mp4',
    }} />);
    expect(markup).not.toContain('<video');
  });

  it('keeps a non-motion, high-contrast path for macOS accessibility preferences', () => {
    const css = readFileSync(new URL('../notch-overlay.css', import.meta.url), 'utf8');
    expect(css).toContain('prefers-reduced-motion:reduce');
    expect(css).toContain('prefers-reduced-transparency:reduce');
    expect(css).toContain('forced-colors:active');
  });

  it('groups confirmation buttons in a dedicated actions row so both fit inside the window', () => {
    const markup = renderToStaticMarkup(<NotchOverlay initialPresentation={{ requestId: 'confirm-1', kind: 'confirmation', text: 'Este cartão apareceu no monitor escolhido?', interaction: 'capture', actions: [{ id: 'confirm', label: 'Apareceu' }, { id: 'cancel', label: 'Não apareceu' }] }} />);
    const actionsMatch = markup.match(/<div class="notch-overlay-actions">([\s\S]*?)<\/div>/);
    expect(actionsMatch).not.toBeNull();
    expect(actionsMatch![1]).toContain('Apareceu');
    expect(actionsMatch![1]).toContain('Não apareceu');
  });

  it('resets the overlay document chrome and hides the idle video during a capture confirmation', () => {
    const css = readFileSync(new URL('../notch-overlay.css', import.meta.url), 'utf8');
    expect(css).toMatch(/html:has\(\.notch-overlay\)[^{]*,\s*html:has\(\.notch-overlay\)\s*body\s*\{[^}]*background:\s*transparent[^}]*min-width:\s*0/);
    expect(css).toMatch(/\.notch-overlay\{[^}]*width:\s*100%[^}]*height:\s*100vh[^}]*overflow:\s*hidden/);
    expect(css).toMatch(/\.notch-overlay\[data-interaction=capture\]\s*video\s*\{\s*display:\s*none/);
  });

  it('lets the base 100vh height apply to the capture card instead of an auto height from #root', () => {
    const css = readFileSync(new URL('../notch-overlay.css', import.meta.url), 'utf8');
    // Tira os blocos @media antes de casar a regra base: senão uma regex não-global pega a
    // primeira ocorrência de qualquer jeito, inclusive uma cópia dentro de media query.
    const cssWithoutMediaBlocks = css.replace(/@media[^{]*\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g, '');
    const captureRuleMatches = [...cssWithoutMediaBlocks.matchAll(/\.notch-overlay\[data-interaction=capture\]\{([^}]*)\}/g)];
    expect(captureRuleMatches).toHaveLength(1);
    expect(captureRuleMatches[0][1]).not.toMatch(/height:\s*\d+%/);
    expect(css).toMatch(/\.notch-overlay\{[^}]*height:100vh/);
  });
});

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NotchOverlay, notchMediaFor } from '../NotchOverlay';
import { readFileSync } from 'node:fs';

describe('NotchOverlay', () => {
  it('uses only semantic companion assets and has an accessible dormant surface', () => {
    expect(notchMediaFor('thinking').url).toContain('searching_loop.mp4');
    expect(notchMediaFor('confirmation').url).toContain('confirmation.mp4');
    expect(notchMediaFor('unrecognised').url).toContain('idle_01_loop.mp4');
    expect(renderToStaticMarkup(<NotchOverlay />)).toContain('aria-live="polite"');
  });

  it('renders a labelled confirmation card with explicit actions', () => {
    const markup = renderToStaticMarkup(<NotchOverlay initialPresentation={{ requestId: 'confirm-1', kind: 'confirmation', text: 'Criar tarefa?', interaction: 'capture', actions: [{ id: 'confirm', label: 'Confirmar' }, { id: 'cancel', label: 'Cancelar' }] }} />);
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('aria-label="Hibi confirmation"');
    expect(markup).toContain('autofocus');
    expect(markup).toContain('Confirmar');
    expect(markup).toContain('Cancelar');
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
    const captureRuleMatch = css.match(/\.notch-overlay\[data-interaction=capture\]\{([^}]*)\}/);
    expect(captureRuleMatch).not.toBeNull();
    expect(captureRuleMatch![1]).not.toMatch(/height:\s*\d+%/);
    expect(css).toMatch(/\.notch-overlay\{[^}]*height:100vh/);
  });
});

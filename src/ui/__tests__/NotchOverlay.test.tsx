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
});

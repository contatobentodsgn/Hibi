import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NotchOverlay, notchMediaFor } from '../NotchOverlay';

describe('NotchOverlay', () => {
  it('uses only semantic companion assets and has an accessible dormant surface', () => {
    expect(notchMediaFor('thinking').url).toContain('searching_loop.mp4');
    expect(notchMediaFor('unrecognised').url).toContain('idle_01_loop.mp4');
    expect(renderToStaticMarkup(<NotchOverlay />)).toContain('aria-live="polite"');
  });
});

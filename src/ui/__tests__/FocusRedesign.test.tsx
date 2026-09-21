import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FocusView } from '../FocusView';
import { FocusBackgroundNotice } from '../FocusBackgroundNotice';

describe('U11 focus and pause surface', () => {
  it('prioritizes the timer and exposes the few session actions in the redesigned surface', () => {
    const markup = renderToStaticMarkup(<FocusView onEvent={vi.fn()} />);

    expect(markup).toContain('hibi-ui');
    expect(markup).toContain('focus-view--redesign');
    expect(markup).toContain('Start focus');
    expect(markup).toContain('Fazer uma pausa');
    expect(markup).toContain('Focus session summary');
  });

  it('keeps an accessible return path when focus continues in the background', () => {
    const markup = renderToStaticMarkup(<FocusBackgroundNotice onReturn={vi.fn()} />);

    expect(markup).toContain('focus-background--redesign');
    expect(markup).toContain('Voltar ao foco');
  });
});

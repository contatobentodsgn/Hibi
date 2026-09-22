import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FocusView } from '../FocusView';
import { FocusBackgroundNotice } from '../FocusBackgroundNotice';
import { LocaleProvider } from '../../i18n/LocaleProvider';

describe('U11 focus and pause surface', () => {
  it('prioritizes the timer and exposes the few session actions in the redesigned surface', () => {
    const markup = renderToStaticMarkup(<LocaleProvider initialLanguage="pt"><FocusView onEvent={vi.fn()} /></LocaleProvider>);

    expect(markup).toContain('hibi-ui');
    expect(markup).toContain('focus-view--redesign');
    expect(markup).toContain('Começar foco');
    expect(markup).not.toContain('Start focus');
    expect(markup).toContain('Fazer uma pausa');
    expect(markup).toContain('Resumo da sessão de foco');
  });

  it('keeps an accessible return path when focus continues in the background', () => {
    const markup = renderToStaticMarkup(<LocaleProvider initialLanguage="en"><FocusBackgroundNotice onReturn={vi.fn()} /></LocaleProvider>);

    expect(markup).toContain('focus-background--redesign');
    expect(markup).toContain('Back to focus');
    expect(markup).not.toContain('A sessão continua mesmo enquanto você usa outras áreas.');
  });
});

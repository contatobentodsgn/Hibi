import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LocaleProvider } from '../../i18n/LocaleProvider';
import { TintSettings } from '../TintSettings';

describe('TintSettings', () => {
  it('mostra os quatro tons do preview, com Lavanda escolhida por padrão, e os dois ajustes de Aparência dele', () => {
    const markup = renderToStaticMarkup(<LocaleProvider initialLanguage="en"><TintSettings onEvent={() => undefined} /></LocaleProvider>);

    expect(markup).toContain('role="radiogroup"');
    expect(markup).toContain('aria-label="App tint"');
    expect(markup.match(/role="radio"/g)).toHaveLength(4);
    for (const name of ['Lavender', 'Blue', 'Mint', 'Peach']) expect(markup).toContain(`aria-label="${name}"`);
    expect(markup).toMatch(/aria-checked="true" aria-label="Lavender"/);
    expect(markup.match(/role="switch"/g)).toHaveLength(2);
    expect(markup).toContain('More contrast');
    expect(markup).toContain('Reduce motion');
  });
});

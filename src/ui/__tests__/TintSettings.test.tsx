import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LocaleProvider } from '../../i18n/LocaleProvider';
import { TintSettings } from '../TintSettings';

describe('TintSettings', () => {
  it('renders five named tint options with Aurora selected by default', () => {
    const markup = renderToStaticMarkup(<LocaleProvider initialLanguage="en"><TintSettings onEvent={() => undefined} /></LocaleProvider>);

    expect(markup).toContain('role="radiogroup"');
    expect(markup).toContain('aria-label="App tint"');
    expect(markup.match(/role="radio"/g)).toHaveLength(5);
    expect(markup).toContain('aria-label="Aurora"');
    expect(markup).toContain('aria-label="Ocean"');
    expect(markup).toContain('aria-label="Moss"');
    expect(markup).toContain('aria-label="Iris"');
    expect(markup).toContain('aria-label="Rose"');
    expect(markup).toContain('aria-checked="true"');
  });
});

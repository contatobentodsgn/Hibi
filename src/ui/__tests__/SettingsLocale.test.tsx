import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createSeedData } from '../../data/seed-data';
import { LocaleProvider } from '../../i18n/LocaleProvider';
import { SettingsWorkspace } from '../SettingsView';

describe('SettingsView locale', () => {
  it('localizes the time format and login settings in Portuguese', () => {
    const markup = renderToStaticMarkup(<LocaleProvider initialLanguage="pt"><SettingsWorkspace data={createSeedData()} onEvent={() => undefined} onReset={() => undefined} /></LocaleProvider>);

    expect(markup).toContain('Formato de hora');
    expect(markup).toContain('Inicie o Pixano automaticamente');
    expect(markup).toContain('Idioma da interface');
    expect(markup).not.toContain('Interface language');
    expect(markup).not.toContain('>Language<');
    expect(markup).not.toContain('Time format');
    expect(markup).not.toContain('Launch at login');
    expect(markup).not.toContain('Use clear, exact times across calendar and reminders');
    expect(markup).not.toContain('Open Pixano automatically when this Mac starts');
  });
});

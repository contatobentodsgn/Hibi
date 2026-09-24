import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalModelSettings } from '../LocalModelSettings';
import { LocaleProvider } from '../../i18n/LocaleProvider';

const render = () => renderToStaticMarkup(<LocaleProvider><LocalModelSettings onEvent={() => undefined} /></LocaleProvider>);
const semPonte = () => { delete (globalThis as { window?: unknown }).window; };

afterEach(() => { semPonte(); });

describe('LocalModelSettings', () => {
  it('sem a ponte do desktop, diz onde o modelo roda em vez de oferecer um botão morto', () => {
    (globalThis as { window?: unknown }).window = {};

    const markup = render();

    expect(markup).toContain('Cérebro offline');
    expect(markup).toContain('O modelo local roda no app de desktop.');
    expect(markup).not.toContain('>Baixar<');
  });

  it('com a ponte, começa sem prometer nada antes de saber o estado', () => {
    // A leitura do estado é assíncrona: a primeira pintura não pode dizer "pronto" por otimismo.
    (globalThis as { window?: unknown }).window = { pixanoDesktop: { getLocalModelState: async () => ({ status: 'ready', modelId: 'qwen3', sizeBytes: 1834426016, error: null }) } };

    const markup = render();

    expect(markup).toContain('Cérebro offline');
    expect(markup).toContain('Indisponível');
    expect(markup).not.toContain('Pronto neste Mac');
  });
});

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createSeedData } from '../../data/seed-data';
import { confirmationPresentationFor, modelLabelFor, TabyView } from '../TabyView';
import { createLocalHibiRuntime } from '../../ai/local-runtime';
import { LocalRepository } from '../../data/local-repository';

describe('TabyView capability boundaries', () => {
  it('shows local capability statuses and unavailable surfaces', () => {
    const data = createSeedData();
    const markup = renderToStaticMarkup(<TabyView data={data} runtime={createLocalHibiRuntime(new LocalRepository(data))} onEvent={() => undefined} />);

    expect(markup).toContain('What I can access');
    expect(markup).toContain('Tasks');
    expect(markup).toContain('Reminders');
    expect(markup).toContain('Calendar');
    expect(markup).toContain('Focus');
    expect(markup).toContain('Notes');
    expect(markup).toContain('External AI');
    expect(markup).toContain('Hardware');
    expect(markup).toContain('No network calls.');
  });

  it('builds a capture presentation with only confirm and cancel actions', () => {
    expect(confirmationPresentationFor('request-1', 'Criar tarefa?')).toEqual({
      requestId: 'request-1', kind: 'confirmation', text: 'Criar tarefa?', interaction: 'capture',
      actions: [{ id: 'confirm', label: 'Confirmar' }, { id: 'cancel', label: 'Cancelar' }],
    });
  });

  it('uses provider model metadata as the response provenance label', () => {
    expect(modelLabelFor({ providerLabel: 'Compatible provider', proposal: { providerMetadata: { model: 'gpt-test' } } })).toBe('gpt-test');
    expect(modelLabelFor({ providerLabel: 'Hibi local tools', proposal: {} })).toBe('Hibi local tools');
  });
});

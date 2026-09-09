import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createSeedData } from '../../data/seed-data';
import { companionEventFor, confirmationPresentationFor, failurePresentationFor, modelLabelFor, provenanceLabelFor, TabyView } from '../TabyView';
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
    expect(markup).toContain('O modo local não usa rede');
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

  it('formats truthful per-response provenance and safe actionable provider failures', () => {
    expect(provenanceLabelFor({ provider: { label: 'OpenAI-compatible', model: 'gpt-test', usage: { inputTokens: 12, outputTokens: 5, totalTokens: 17 }, fallback: false } })).toBe('OpenAI-compatible · gpt-test · 17 tokens');
    expect(failurePresentationFor({ code: 'invalid_credentials', retryable: false })).toEqual({
      title: 'Check the API key',
      detail: 'The configured provider rejected its credentials. Your key remains in Keychain.',
      canRetry: false,
      canUseLocalFallback: true,
    });
    expect(failurePresentationFor({ code: 'rate_limited', retryable: true, retryAfterMs: 3_000 })).toMatchObject({
      title: 'Rate limit reached',
      detail: 'The provider is temporarily limiting requests. Try again in about 3 seconds.',
      canRetry: true,
      canUseLocalFallback: true,
    });
  });

  it('maps assistant stages, confirmations, results, and failures to companion events', () => {
    expect(companionEventFor('confirmation', 'c-1', 'Confirm?', 10)).toMatchObject({ type: 'confirmation.requested', requestId: 'c-1', actions: [{ id: 'confirm', label: 'Confirmar' }, { id: 'cancel', label: 'Cancelar' }] });
    expect(companionEventFor('result', 'r-1', 'Done', 10)).toMatchObject({ type: 'ai.result', requestId: 'r-1', expiresInMs: 4_000 });
    expect(companionEventFor('error', 'e-1', 'Failed', 10)).toMatchObject({ type: 'error.raised', requestId: 'e-1', expiresInMs: 5_000 });
  });
});

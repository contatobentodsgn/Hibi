import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createSeedData } from '../../data/seed-data';
import { initialAssistantTurnState } from '../../ai/assistant-turn';
import { companionEventFor, confirmationPresentationFor, failurePresentationFor } from '../assistant-presentation';
import { TabyView } from '../TabyView';
import type { AssistantTurnControls } from '../useAssistantTurn';

// Duplo inerte: nenhuma ação é chamada nestes testes, só o markup estático importa.
const inertTurn: AssistantTurnControls = {
  state: initialAssistantTurnState,
  ask: async () => undefined,
  confirm: async () => undefined,
  cancelConfirmation: async () => undefined,
  stop: () => undefined,
  retry: async () => undefined,
  useLocalFallback: async () => undefined,
  dismiss: () => 'close',
  reset: () => undefined,
};

describe('TabyView capability boundaries', () => {
  it('shows local capability statuses and unavailable surfaces', () => {
    const data = createSeedData();
    const markup = renderToStaticMarkup(<TabyView data={data} turn={inertTurn} />);

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

  it('formats safe actionable provider failures', () => {
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

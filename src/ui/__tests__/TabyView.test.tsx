import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createSeedData } from '../../data/seed-data';
import { initialAssistantTurnState } from '../../ai/assistant-turn';
import { appendMessage, createConversation } from '../../domain/conversations';
import { LocaleProvider } from '../../i18n/LocaleProvider';
import { companionEventFor, confirmationPresentationFor, failurePresentationFor } from '../assistant-presentation';
import { TabyView } from '../TabyView';
import type { AssistantTurnControls } from '../useAssistantTurn';

const noop = () => undefined;
const at = (hour: number) => new Date(2026, 8, 11, hour, 0).toISOString();
const host = { storage: { getItem: () => null, setItem: noop } };
const saved = [appendMessage(createConversation('agenda da semana', at(9), 'c-1'), { role: 'assistant', text: 'Reunião com Kabrito', at: at(9) })];

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

// A tela não é mais dona da thread: ela recebe o controlador pronto, como o App o entrega.
const conversations = { conversations: saved, activeId: 'c-1', query: '', saveFailed: false, record: noop, select: noop, create: noop, remove: noop, removeAll: noop, search: noop };

describe('TabyView capability boundaries', () => {
  it('shows local capability statuses and unavailable surfaces', () => {
    const data = createSeedData();
    const markup = renderToStaticMarkup(<TabyView data={data} turn={inertTurn} conversations={conversations} />);

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

describe('TabyView conversations', () => {
  it('renders the conversations it is given', () => {
    const markup = renderToStaticMarkup(
      <LocaleProvider initialLanguage="pt" host={host}>
        <TabyView data={createSeedData()} turn={inertTurn} conversations={conversations} />
      </LocaleProvider>,
    );
    expect(markup).toContain('agenda da semana');
    expect(markup).toContain('Conversas');
  });

  it('greets through the dictionary instead of a hardcoded string', () => {
    const source = readFileSync(new URL('../TabyView.tsx', import.meta.url), 'utf8');
    expect(source).not.toContain('Olá! Sou o assistente local do Hibi');
    expect(source).toContain("t('taby.greeting')");
  });
});

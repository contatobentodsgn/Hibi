import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { initialAssistantTurnState } from '../../ai/assistant-turn';
import { createSeedData } from '../../data/seed-data';
import { appendMessage, createConversation } from '../../domain/conversations';
import { AssistantScreen } from '../redesign/screens/AssistantScreen';
import type { AssistantTurnControls } from '../useAssistantTurn';
import { LocaleProvider } from '../../i18n/LocaleProvider';

const noop = () => undefined;
const turn: AssistantTurnControls = { state: initialAssistantTurnState, ask: async () => undefined, confirm: async () => undefined, cancelConfirmation: async () => undefined, stop: noop, retry: async () => undefined, useLocalFallback: async () => undefined, dismiss: () => 'close', reset: noop };
const conversation = appendMessage(createConversation('organize meu dia', '2026-09-21T09:00:00.000Z', 'assistant-1'), { role: 'assistant', text: 'Vamos começar pelo próximo compromisso.', at: '2026-09-21T09:01:00.000Z' });
const conversations = { conversations: [conversation], activeId: 'assistant-1', query: '', saveFailed: false, record: noop, select: noop, create: noop, remove: noop, removeAll: noop, search: noop };

describe('AssistantScreen', () => {
  it('presents the active conversation, history controls and an accessible composer in the redesigned surface', () => {
    const markup = renderToStaticMarkup(<LocaleProvider initialLanguage="pt"><AssistantScreen data={createSeedData()} turn={turn} conversations={conversations} /></LocaleProvider>);

    expect(markup).toContain('Assistente local');
    expect(markup).toContain('Seu espaço para pensar.');
    expect(markup).toContain('organize meu dia');
    expect(markup).toContain('Vamos começar pelo próximo compromisso.');
    expect(markup).toContain('Nova conversa');
    expect(markup).toContain('Ocultar conversas');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('Pergunte ou peça uma ação');
    expect(markup).toContain('assistant-screen');
  });

  it('keeps a safe provider boundary visible instead of implying external access', () => {
    const markup = renderToStaticMarkup(<LocaleProvider initialLanguage="pt"><AssistantScreen data={createSeedData()} turn={turn} conversations={conversations} /></LocaleProvider>);
    expect(markup).toContain('Ferramentas locais e confirmações explícitas.');
    expect(markup).toContain('IA externa');
  });

  it('localizes the empty conversation and assistant status in Portuguese', () => {
    const emptyConversations = { ...conversations, conversations: [], activeId: null };
    const markup = renderToStaticMarkup(<LocaleProvider initialLanguage="pt"><AssistantScreen data={createSeedData()} turn={turn} conversations={emptyConversations} /></LocaleProvider>);
    expect(markup).toContain('Nenhuma conversa selecionada');
    expect(markup).not.toContain('No conversation selected');
    expect(markup).toContain('Pronto para ajudar');
  });
});

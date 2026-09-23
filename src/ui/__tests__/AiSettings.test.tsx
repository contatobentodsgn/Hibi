import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { translate, type DictionaryKey } from '../../i18n/dictionary';
import { AiSettings, aiSaveFailureMessage, usageSummaryFor } from '../SettingsView';

const pt = (key: DictionaryKey) => translate('pt', key);
const en = (key: DictionaryKey) => translate('en', key);
const groq = { endpoint: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.1-70b-versatile' };
// O erro chega do processo principal via ipcRenderer.invoke, que prefixa a mensagem.
const ipcError = (code: string) => new Error(`Error invoking remote method 'pixano:ai-config:save': Error: AI provider request failed: ${code}.`);

describe('AI settings', () => {
  it('shows the provider, model presets, fallback policy, and Keychain-only credential controls', () => {
    const markup = renderToStaticMarkup(<AiSettings onEvent={() => undefined} fallbackPolicy="never" onFallbackPolicyChange={() => undefined} />);

    expect(markup).toContain('Provider');
    expect(markup).toContain('Endpoint');
    expect(markup).toContain('Model');
    expect(markup).toContain('Model preset');
    expect(markup).toContain('Fast');
    expect(markup).toContain('Balanced');
    expect(markup).toContain('Reasoning');
    expect(markup).toContain('Custom');
    expect(markup).toContain('Fallback policy');
    expect(markup).toContain('Ask before using local fallback');
    expect(markup).toContain('Automatically use local fallback');
    expect(markup).toContain('Never use local fallback');
    expect(markup).toContain('Stored only in macOS Keychain');
    expect(markup).toContain('Save AI settings');
    expect(markup).toContain('The endpoint, key, and model are tested before any setting is saved.');
  });

  // O caso que motivou a mudança: testar a conexão com um id de modelo que não existe.
  it('names the endpoint and the model when the provider rejects the request', () => {
    const message = aiSaveFailureMessage(ipcError('invalid_request'), groq, pt);

    expect(message).toContain(groq.endpoint);
    expect(message).toContain(groq.model);
    expect(message).toContain('id de modelo inexistente');
    expect(message).not.toContain('invalid_request');
    expect(message).toBe(
      'O provedor recusou a requisição. Confira o endpoint https://api.groq.com/openai/v1/chat/completions e o modelo llama-3.1-70b-versatile — um id de modelo inexistente é a causa mais comum. Tentar de novo não resolve.',
    );
    expect(aiSaveFailureMessage(ipcError('invalid_request'), groq, en)).toBe(
      'The provider rejected the request itself. Check the endpoint https://api.groq.com/openai/v1/chat/completions and the model llama-3.1-70b-versatile — a model id that does not exist is the most common cause. Retrying will not help.',
    );
  });

  it('keeps a genuinely unreadable answer distinct from a rejected request', () => {
    expect(aiSaveFailureMessage(ipcError('invalid_response'), groq, pt)).toContain('não deu para interpretar');
    expect(aiSaveFailureMessage(ipcError('invalid_response'), groq, pt)).not.toContain(groq.model);
    expect(aiSaveFailureMessage(ipcError('invalid_credentials'), groq, pt)).toContain('chave');
  });

  it('falls back to the raw message for anything it does not recognise', () => {
    expect(aiSaveFailureMessage(new Error('External AI requires an endpoint and model.'), groq, pt)).toBe('External AI requires an endpoint and model.');
    expect(aiSaveFailureMessage('not an error', groq, pt)).toBe('Não foi possível salvar os ajustes de IA.');
  });

  it('summarizes local AI usage without exposing prompts or credentials', () => {
    expect(usageSummaryFor([{ at: '2026-09-09T12:00:00.000Z', provider: 'OpenAI-compatible', model: 'gpt-4.1-mini', inputTokens: 12, outputTokens: 5, totalTokens: 17, outcome: 'completed', fallback: false }])).toEqual({ turns: 1, totalTokens: 17, estimatedCost: 0 });
  });
});

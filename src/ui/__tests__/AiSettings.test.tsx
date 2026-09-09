import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AiSettings, usageSummaryFor } from '../SettingsView';

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

  it('summarizes local AI usage without exposing prompts or credentials', () => {
    expect(usageSummaryFor([{ at: '2026-09-09T12:00:00.000Z', provider: 'OpenAI-compatible', model: 'gpt-4.1-mini', inputTokens: 12, outputTokens: 5, totalTokens: 17, outcome: 'completed', fallback: false }])).toEqual({ turns: 1, totalTokens: 17, estimatedCost: 0 });
  });
});

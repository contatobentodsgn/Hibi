import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AiSettings } from '../SettingsView';

describe('AI settings', () => {
  it('shows the provider, endpoint, model, and Keychain-only credential controls', () => {
    const markup = renderToStaticMarkup(<AiSettings onEvent={() => undefined} />);

    expect(markup).toContain('Provider');
    expect(markup).toContain('Endpoint');
    expect(markup).toContain('Model');
    expect(markup).toContain('Stored only in macOS Keychain');
    expect(markup).toContain('Save AI settings');
  });
});

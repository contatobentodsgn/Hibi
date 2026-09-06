import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createSeedData } from '../../data/seed-data';
import { SettingsView } from '../SettingsView';

describe('Settings notifications action', () => {
  it('renders a native notification test action', () => {
    const markup = renderToStaticMarkup(
      <SettingsView data={createSeedData()} onEvent={() => undefined} onReset={() => undefined} onTestNotification={() => Promise.resolve(true)} />,
    );

    expect(markup).toContain('Send test notification');
  });
});

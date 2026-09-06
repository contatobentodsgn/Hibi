import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createSeedData } from '../../data/seed-data';
import { SettingsView } from '../SettingsView';

describe('Settings notifications action', () => {
  it('exposes a dedicated notifications settings section', () => {
    const markup = renderToStaticMarkup(
      <SettingsView data={createSeedData()} onEvent={() => undefined} onReset={() => undefined} onTestNotification={() => Promise.resolve(true)} />,
    );

    expect(markup).toContain('>Notifications</button>');
  });
});

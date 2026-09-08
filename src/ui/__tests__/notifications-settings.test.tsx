import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createSeedData } from '../../data/seed-data';
import { SettingsView, syncLaunchAtLogin } from '../SettingsView';

describe('Settings notifications action', () => {
  it('exposes a dedicated notifications settings section', () => {
    const markup = renderToStaticMarkup(
      <SettingsView data={createSeedData()} onEvent={() => undefined} onReset={() => undefined} onTestNotification={() => Promise.resolve(true)} />,
    );

    expect(markup).toContain('>Notifications</button>');
    expect(markup).toContain('>AI</button>');
  });
});

describe('Launch at login state', () => {
  it('uses the operating system readback instead of assuming a requested value was applied', async () => {
    const calls: string[] = [];
    const actual = await syncLaunchAtLogin({
      setOpenAtLogin: async (enabled) => { calls.push(`set:${enabled}`); return true; },
      getOpenAtLogin: async () => { calls.push('get'); return false; },
    }, true);

    expect(actual).toBe(false);
    expect(calls).toEqual(['set:true', 'get']);
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');

describe('schedule validation feedback', () => {
  it('uses an accessible inline error surface instead of a browser alert', () => {
    expect(appSource).not.toContain('window.alert(validation.errors.join');
    expect(appSource).toContain('role="alert"');
    expect(appSource).toContain('aria-live="assertive"');
  });
});

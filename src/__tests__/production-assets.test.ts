import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('production asset paths', () => {
  it('builds relative assets so Electron can load a local file URL', () => {
    const config = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8');
    expect(config).toContain("base: './'");
  });
});

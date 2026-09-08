import { describe, expect, it } from 'vitest';
import { createSeedData } from '../seed-data';
import { createWorkspaceBackup, parseWorkspaceBackup } from '../workspace-backup';

describe('workspace backups', () => {
  it('round-trips every local workspace collection and safe preferences', () => {
    const seed = createSeedData();
    seed.notes.push({ id: 'note-backup', title: 'Context', content: 'Keep this', createdAt: '2026-09-08T10:00:00.000Z', updatedAt: '2026-09-08T10:00:00.000Z' });
    const backup = createWorkspaceBackup(seed, { language: 'pt', twentyFourHour: true }, '2026-09-08T10:00:00.000Z');
    const restored = parseWorkspaceBackup(JSON.stringify(backup), createSeedData());
    expect(restored.data).toEqual(seed);
    expect(restored.preferences).toEqual({ language: 'pt', twentyFourHour: true });
    expect(JSON.stringify(restored)).not.toMatch(/api[_-]?key|keychain|token/i);
  });

  it('rejects malformed or incompatible files before anything can be restored', () => {
    expect(() => parseWorkspaceBackup('{', createSeedData())).toThrow('valid JSON');
    expect(() => parseWorkspaceBackup(JSON.stringify({ app: 'Other', version: 1 }), createSeedData())).toThrow('compatible Hibi');
  });
});

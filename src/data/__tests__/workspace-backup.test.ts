import { describe, expect, it } from 'vitest';
import { createSeedData } from '../seed-data';
import { createActivityRecord } from '../../domain/activity';
import { createWorkspaceBackup, parseWorkspaceBackup, WORKSPACE_BACKUP_VERSION } from '../workspace-backup';

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

  it('round-trips the activity ledger as a version 2 backup', () => {
    const seed = createSeedData();
    seed.activity.push(createActivityRecord({ type: 'task.completed', at: '2026-09-08T10:00:00.000Z', entityId: 'task-1' }));
    const backup = createWorkspaceBackup(seed, { language: 'en', twentyFourHour: false }, '2026-09-08T10:00:00.000Z');
    expect(backup.version).toBe(2);
    const restored = parseWorkspaceBackup(JSON.stringify(backup), createSeedData());
    expect(restored.version).toBe(2);
    expect(restored.data.activity).toEqual(seed.activity);
    expect(restored.preferences).toEqual({ language: 'en', twentyFourHour: false });
  });

  it('upgrades a version 1 backup without activity into a version 2 backup with an empty ledger', () => {
    const seed = createSeedData();
    const { activity, ...dataWithoutActivity } = seed;
    const legacy = { app: 'Hibi', version: 1, exportedAt: '2026-09-08T10:00:00.000Z', data: dataWithoutActivity, preferences: { language: 'pt', twentyFourHour: true } };
    const restored = parseWorkspaceBackup(JSON.stringify(legacy), createSeedData());
    expect(restored.version).toBe(2);
    expect(restored.data.activity).toEqual([]);
    expect(restored.preferences).toEqual({ language: 'pt', twentyFourHour: true });
  });

  it('rejects a backup with a malformed activity record', () => {
    const seed = createSeedData();
    const backup = createWorkspaceBackup(seed, { language: 'pt', twentyFourHour: true }, '2026-09-08T10:00:00.000Z');
    (backup.data.activity as unknown[]) = [{ id: 'bad' }];
    expect(() => parseWorkspaceBackup(JSON.stringify(backup), createSeedData())).toThrow();
  });

  it('rejects a backup with duplicate activity ids', () => {
    const seed = createSeedData();
    const record = createActivityRecord({ type: 'task.completed', at: '2026-09-08T10:00:00.000Z' });
    seed.activity.push(record, { ...record });
    expect(() => parseWorkspaceBackup(JSON.stringify(createWorkspaceBackup(seed, { language: 'pt', twentyFourHour: true })), createSeedData())).toThrow('Duplicate activity id');
  });

  it('never includes credential-shaped keys in the exported JSON', () => {
    const seed = createSeedData();
    seed.activity.push(createActivityRecord({ type: 'task.completed', at: '2026-09-08T10:00:00.000Z' }));
    const backup = createWorkspaceBackup(seed, { language: 'pt', twentyFourHour: true });
    expect(JSON.stringify(backup)).not.toMatch(/apiKey|token|secret|password/i);
  });

  it('rejects a future backup version', () => {
    const seed = createSeedData();
    const future = { app: 'Hibi', version: 3, exportedAt: '2026-09-08T10:00:00.000Z', data: seed, preferences: { language: 'pt', twentyFourHour: true } };
    expect(() => parseWorkspaceBackup(JSON.stringify(future), createSeedData())).toThrow('compatible Hibi');
  });

  it('exposes WORKSPACE_BACKUP_VERSION as 2', () => {
    expect(WORKSPACE_BACKUP_VERSION).toBe(2);
  });

  it('carries no conversation text, because conversations live outside StudyData', () => {
    const data = createSeedData();
    const backup = createWorkspaceBackup(data, { language: 'pt', twentyFourHour: true });

    expect(JSON.stringify(backup)).not.toContain('hibi-conversations');
    expect(Object.keys(backup.data)).not.toContain('conversations');
  });
});

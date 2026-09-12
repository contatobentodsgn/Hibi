import { describe, expect, it } from 'vitest';
import { createSeedData } from '../seed-data';
import { createActivityRecord } from '../../domain/activity';
import { createWorkspaceBackup, parseWorkspaceBackup, WORKSPACE_BACKUP_VERSION } from '../workspace-backup';
import { DEFAULT_FOCUS_SETTINGS } from '../../ui/focus-settings';

describe('workspace backups', () => {
  it('round-trips every local workspace collection and safe preferences', () => {
    const seed = createSeedData();
    seed.notes.push({ id: 'note-backup', title: 'Context', content: 'Keep this', createdAt: '2026-09-08T10:00:00.000Z', updatedAt: '2026-09-08T10:00:00.000Z' });
    const backup = createWorkspaceBackup(seed, { language: 'pt', twentyFourHour: true }, '2026-09-08T10:00:00.000Z');
    const restored = parseWorkspaceBackup(JSON.stringify(backup), createSeedData());
    expect(restored.data).toEqual(seed);
    expect(restored.preferences).toEqual({ language: 'pt', twentyFourHour: true, focus: DEFAULT_FOCUS_SETTINGS });
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
    expect(restored.preferences).toEqual({ language: 'en', twentyFourHour: false, focus: DEFAULT_FOCUS_SETTINGS });
  });

  it('upgrades a version 1 backup without activity into a version 2 backup with an empty ledger', () => {
    const seed = createSeedData();
    const { activity, ...dataWithoutActivity } = seed;
    const legacy = { app: 'Hibi', version: 1, exportedAt: '2026-09-08T10:00:00.000Z', data: dataWithoutActivity, preferences: { language: 'pt', twentyFourHour: true } };
    const restored = parseWorkspaceBackup(JSON.stringify(legacy), createSeedData());
    expect(restored.version).toBe(2);
    expect(restored.data.activity).toEqual([]);
    expect(restored.preferences).toEqual({ language: 'pt', twentyFourHour: true, focus: DEFAULT_FOCUS_SETTINGS });
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

  // A aba Dados promete restaurar "safe preferences", e os ajustes de Foco são exatamente isso:
  // duração, horário ativo e intensidade dos lembretes, sem nada de credencial.
  it('round-trips the focus settings, and defaults them on a backup exported before they existed', () => {
    const seed = createSeedData();
    const focus = { ...DEFAULT_FOCUS_SETTINGS, sessionMinutes: 50, activeStart: '08:00', activeEnd: '20:00', nudgePreset: 'calm' as const };
    const restored = parseWorkspaceBackup(JSON.stringify(createWorkspaceBackup(seed, { language: 'pt', twentyFourHour: true, focus })), createSeedData());
    expect(restored.preferences.focus).toEqual(focus);

    const legacy = { app: 'Hibi', version: 2, exportedAt: '2026-09-08T10:00:00.000Z', data: seed, preferences: { language: 'pt', twentyFourHour: true } };
    expect(parseWorkspaceBackup(JSON.stringify(legacy), createSeedData()).preferences.focus).toEqual(DEFAULT_FOCUS_SETTINGS);
  });

  // Os quatro ajustes de presença — o timeout de tela do Taby incluído — são preferência segura e
  // entram no backup. Um backup exportado antes deles restaura os campos antigos e ganha os padrões.
  it('round-trips the presence settings, and defaults them on a backup exported before they existed', () => {
    const seed = createSeedData();
    const focus = { ...DEFAULT_FOCUS_SETTINGS, idleMinutes: 10, awayBehavior: 'pause' as const, focusLoopAnimation: 'music' as const, screenTimeoutSeconds: 300 };
    const exported = JSON.parse(JSON.stringify(createWorkspaceBackup(seed, { language: 'pt', twentyFourHour: true, focus })));
    expect(exported.preferences.focus).toMatchObject({ idleMinutes: 10, awayBehavior: 'pause', focusLoopAnimation: 'music', screenTimeoutSeconds: 300 });
    expect(parseWorkspaceBackup(JSON.stringify(exported), createSeedData()).preferences.focus).toEqual(focus);

    const beforePresence = { app: 'Hibi', version: 2, exportedAt: '2026-09-08T10:00:00.000Z', data: seed, preferences: { language: 'pt', twentyFourHour: true, focus: { sessionMinutes: 50, activeStart: '08:00', activeEnd: '20:00', nudgePreset: 'calm' } } };
    expect(parseWorkspaceBackup(JSON.stringify(beforePresence), createSeedData()).preferences.focus).toEqual({ ...DEFAULT_FOCUS_SETTINGS, sessionMinutes: 50, activeStart: '08:00', activeEnd: '20:00', nudgePreset: 'calm' });

    const corrupted = { ...beforePresence, preferences: { ...beforePresence.preferences, focus: { idleMinutes: 'muito', awayBehavior: 'fugir', screenTimeoutSeconds: -1 } } };
    expect(parseWorkspaceBackup(JSON.stringify(corrupted), createSeedData()).preferences.focus).toEqual(DEFAULT_FOCUS_SETTINGS);
  });

  it('carries no conversation text, because conversations live outside StudyData', () => {
    const data = createSeedData();
    const backup = createWorkspaceBackup(data, { language: 'pt', twentyFourHour: true });

    expect(JSON.stringify(backup)).not.toContain('hibi-conversations');
    expect(Object.keys(backup.data)).not.toContain('conversations');
  });
});

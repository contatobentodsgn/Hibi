import type { StudyData } from '../domain/models';
import { LocalRepository } from './local-repository';

export const WORKSPACE_BACKUP_VERSION = 1;

export type WorkspacePreferences = {
  language: 'pt' | 'en';
  twentyFourHour: boolean;
};

export type WorkspaceBackup = {
  app: 'Hibi';
  version: typeof WORKSPACE_BACKUP_VERSION;
  exportedAt: string;
  data: StudyData;
  preferences: WorkspacePreferences;
};

export function createWorkspaceBackup(data: StudyData, preferences: WorkspacePreferences, exportedAt = new Date().toISOString()): WorkspaceBackup {
  return { app: 'Hibi', version: WORKSPACE_BACKUP_VERSION, exportedAt, data: JSON.parse(JSON.stringify(data)) as StudyData, preferences };
}

export function parseWorkspaceBackup(json: string, seed: StudyData): WorkspaceBackup {
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { throw new Error('The selected file is not valid JSON.'); }
  if (!parsed || typeof parsed !== 'object') throw new Error('The selected file is not a Hibi backup.');
  const backup = parsed as Partial<WorkspaceBackup>;
  if (backup.app !== 'Hibi' || backup.version !== WORKSPACE_BACKUP_VERSION || typeof backup.exportedAt !== 'string' || !backup.data || !backup.preferences) throw new Error('This file is not a compatible Hibi workspace backup.');
  if (backup.preferences.language !== 'pt' && backup.preferences.language !== 'en') throw new Error('The backup has an unsupported language preference.');
  if (typeof backup.preferences.twentyFourHour !== 'boolean') throw new Error('The backup has an invalid time format preference.');
  LocalRepository.fromJson(seed, JSON.stringify(backup.data));
  return createWorkspaceBackup(backup.data, backup.preferences, backup.exportedAt);
}

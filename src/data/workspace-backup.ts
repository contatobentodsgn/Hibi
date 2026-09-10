import type { StudyData } from '../domain/models';
import { LocalRepository } from './local-repository';

export const WORKSPACE_BACKUP_VERSION = 2;

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

// Backups na versão 1 não tinham o ledger de atividade; o tipo aceita `data` sem esse campo.
type WorkspaceBackupV1Input = {
  app: 'Hibi';
  version: 1;
  exportedAt: string;
  data: Omit<StudyData, 'activity'> & { activity?: StudyData['activity'] };
  preferences: WorkspacePreferences;
};

const SUPPORTED_INPUT_VERSIONS = [1, 2] as const;

export function createWorkspaceBackup(data: StudyData, preferences: WorkspacePreferences, exportedAt = new Date().toISOString()): WorkspaceBackup {
  return { app: 'Hibi', version: WORKSPACE_BACKUP_VERSION, exportedAt, data: JSON.parse(JSON.stringify(data)) as StudyData, preferences };
}

export function parseWorkspaceBackup(json: string, seed: StudyData): WorkspaceBackup {
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { throw new Error('The selected file is not valid JSON.'); }
  if (!parsed || typeof parsed !== 'object') throw new Error('The selected file is not a Hibi backup.');
  const backup = parsed as Partial<WorkspaceBackup | WorkspaceBackupV1Input>;
  if (backup.app !== 'Hibi' || !(SUPPORTED_INPUT_VERSIONS as readonly number[]).includes(backup.version as number) || typeof backup.exportedAt !== 'string' || !backup.data || !backup.preferences) throw new Error('This file is not a compatible Hibi workspace backup.');
  if (backup.preferences.language !== 'pt' && backup.preferences.language !== 'en') throw new Error('The backup has an unsupported language preference.');
  if (typeof backup.preferences.twentyFourHour !== 'boolean') throw new Error('The backup has an invalid time format preference.');
  // fromJson valida os registros de atividade (schema, duplicatas) e preenche `activity: []` quando ausente (backup v1).
  const normalized = LocalRepository.fromJson(seed, JSON.stringify(backup.data)).snapshot();
  return createWorkspaceBackup(normalized, backup.preferences, backup.exportedAt);
}

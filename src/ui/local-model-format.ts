import type { DictionaryKey } from '../i18n/dictionary';

export type LocalModelStatus = 'unavailable' | 'missing' | 'unverified' | 'ready';
export type LocalModelDownload = Readonly<{ status: string; receivedBytes: number; totalBytes: number; error: string | null }>;

/** Gigabytes com uma casa: o modelo tem quase dois, e mostrar bytes crus não diz nada a ninguém. */
export function formatModelSize(bytes: number | undefined): string {
  if (!Number.isFinite(bytes) || (bytes ?? 0) <= 0) return '—';
  const value = bytes as number;
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${Math.round(value / 1024 ** 2)} MB`;
  return `${Math.round(value / 1024)} KB`;
}

/** O que a tela diz de cada estado. Cada um leva a uma ação diferente, então cada um tem texto próprio. */
export function modelStatusKey(status: LocalModelStatus): DictionaryKey {
  if (status === 'ready') return 'data.model.status.ready';
  if (status === 'missing') return 'data.model.status.missing';
  if (status === 'unverified') return 'data.model.status.unverified';
  return 'data.model.status.unavailable';
}

/**
 * O progresso só existe enquanto o total é conhecido e maior que zero: dividir por um total
 * desconhecido daria uma barra que salta ou fica em `NaN%`.
 */
export function downloadPercent(state: LocalModelDownload | null): number | null {
  if (!state || state.status !== 'downloading') return null;
  if (!Number.isFinite(state.totalBytes) || state.totalBytes <= 0) return null;
  const received = Number.isFinite(state.receivedBytes) ? Math.max(0, state.receivedBytes) : 0;
  return Math.min(100, Math.floor((received / state.totalBytes) * 100));
}

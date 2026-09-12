// Tipos do agendador. Como `focus-gate.d.cts`, este arquivo existe para o `tsc` (com `allowJs: false`)
// enxergar um módulo CommonJS que o renderer também importa: a prévia em Ajustes precisa de
// `nextOccurrence` para percorrer as ocorrências do dia com a MESMA regra que o agendador aplica.

import type { FocusSettings } from './focus-gate.cjs';

export type SchedulerEntry = {
  id: string;
  kind: 'deadline' | 'reminder';
  title: string;
  body: string;
  at: string;
  recurrence?: unknown;
  category?: 'important' | 'wellbeing';
};

export type FocusSyncContext = {
  settings?: FocusSettings;
  focusUntilMs?: number | null;
};

export declare const MAX_TIMEOUT_MS: number;
export declare const MAX_ENTRIES: number;
export declare const MAX_ID_LENGTH: number;
export declare const MAX_TITLE_LENGTH: number;
export declare const MAX_BODY_LENGTH: number;

export declare function nextOccurrence<Entry extends { at: string }>(entry: Entry, afterMs: number): number | null;
export declare function sanitizeEntries(entries: unknown): SchedulerEntry[];
export declare function createNotificationScheduler(options?: {
  NotificationClass?: unknown;
  now?: () => number;
  setTimeout?: (callback: () => void, delay: number) => unknown;
  clearTimeout?: (timer: unknown) => void;
  onTrigger?: (entry: SchedulerEntry) => void;
}): {
  sync(entries: unknown, context?: FocusSyncContext): void;
  clear(): void;
};

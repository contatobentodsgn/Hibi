// Tipos do portão de foco. O módulo é ESM para que os dois lados leiam o MESMO arquivo: o agendador
// (`notifications.cjs`, processo principal) via `require()` de `.mjs`, e o renderer via import — assim
// a prévia em Ajustes e o disparo real nunca podem divergir. Este `.d.mts` é o que deixa o `tsc`
// enxergar esse arquivo com `allowJs: false`.

export type NudgePreset = 'calm' | 'work' | 'wellbeing';

export type FocusSettings = {
  sessionMinutes: number;
  activeStart: string;
  activeEnd: string;
  nudgePreset: NudgePreset;
};

export type GatedEntry = {
  kind: 'deadline' | 'reminder';
  category?: 'important' | 'wellbeing';
};

export type GateContext = {
  settings: FocusSettings;
  focusUntilMs?: number | null;
  lastNudgeAtMs?: number | null;
};

export declare const DEFAULT_FOCUS_SETTINGS: Readonly<FocusSettings>;
export declare const NUDGE_PRESETS: Readonly<Record<NudgePreset, number>>;
export declare const SESSION_LENGTHS: readonly number[];

export declare function sanitizeFocusSettings(value: unknown): FocusSettings;
export declare function sanitizeFocusUntil(value: unknown): number | null;
export declare function isExempt(entry: GatedEntry): boolean;
export declare function withinActiveHours(ms: number, settings: FocusSettings): number;
export declare function nextDelivery(entry: GatedEntry, occurrenceMs: number, context: GateContext): number;
export declare function countDailyAlerts<Entry extends GatedEntry>(input: {
  entries: readonly Entry[];
  settings: FocusSettings;
  dayStartMs: number;
  nextOccurrence: (entry: Entry, afterMs: number) => number | null;
  focusUntilMs?: number | null;
}): number;

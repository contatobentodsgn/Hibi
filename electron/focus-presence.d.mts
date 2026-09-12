// Tipos do módulo de presença. Como em `focus-gate.d.mts`, é este arquivo que deixa o `tsc` enxergar o
// `.mjs` compartilhado entre o processo principal e o renderer com `allowJs: false`.

export type AwayBehavior = 'ask' | 'pause' | 'keep';
export type FocusLoopAnimation = 'focus' | 'music';
/** O humor do companion durante o foco: só de runtime, nunca um ajuste. */
export type FocusMood = 'bored' | 'normal' | 'excited';
export type FocusLoopAnimationId = 'working_laptop_bored_loop' | 'working_laptop_normal_loop' | 'working_laptop_excited_loop' | 'listening_music_loop';
export type AwayResponse = 'ask' | 'pause' | 'none';
export type PresenceReason = 'idle' | 'power';

export type PresenceSettings = {
  idleMinutes: number;
  awayBehavior: AwayBehavior;
  focusLoopAnimation: FocusLoopAnimation;
  screenTimeoutSeconds: number;
};

export type PresenceEvent =
  | { type: 'away'; reason: PresenceReason; idleSeconds: number; atMs: number }
  | { type: 'returned'; reason: PresenceReason; awaySeconds: number; atMs: number };

export type PresenceWatchRequest = { watching: boolean; idleMinutes: number };

export type PresenceState = Readonly<{
  away: Readonly<{ reason: PresenceReason; sinceMs: number }> | null;
  locked: boolean;
  suspended: boolean;
}>;

export type PresenceInput =
  | { kind: 'poll'; idleSeconds: number; thresholdSeconds: number; nowMs: number }
  | { kind: 'power'; event: 'lock-screen' | 'suspend' | 'unlock-screen' | 'resume'; idleSeconds: number; nowMs: number };

export declare const IDLE_MINUTES: readonly number[];
export declare const AWAY_BEHAVIORS: readonly AwayBehavior[];
export declare const FOCUS_LOOP_ANIMATIONS: readonly FocusLoopAnimation[];
export declare const FOCUS_MOODS: readonly FocusMood[];
export declare const SCREEN_TIMEOUT_SECONDS: readonly number[];
export declare const DEFAULT_PRESENCE_SETTINGS: Readonly<PresenceSettings>;
export declare const PRESENCE_POLL_MS: number;
export declare const POWER_AWAY_EVENTS: readonly string[];
export declare const POWER_RETURN_EVENTS: readonly string[];
export declare const INITIAL_PRESENCE_STATE: PresenceState;

export declare function sanitizePresenceSettings(value: unknown): PresenceSettings;
export declare function resolveFocusLoopAnimationId(preference: FocusLoopAnimation | undefined, mood?: FocusMood): FocusLoopAnimationId;
export declare function decideAwayResponse(input: { mode: 'focus' | 'break'; phase: 'idle' | 'running' | 'paused'; behavior: AwayBehavior }): AwayResponse;
export declare function sanitizePresenceWatch(value: unknown): { watching: boolean; idleSeconds: number };
export declare function stepPresence(state: PresenceState | null | undefined, input: PresenceInput): { state: PresenceState; event?: PresenceEvent };
export declare function createPresenceMonitor(options: {
  powerMonitor: { getSystemIdleTime?: () => number; on?: (event: string, listener: () => void) => void; removeListener?: (event: string, listener: () => void) => void };
  onChange?: (event: PresenceEvent) => void;
  setInterval?: (callback: () => void, ms: number) => unknown;
  clearInterval?: (timer: unknown) => void;
  now?: () => number;
  pollMs?: number;
}): { watch: (value: unknown) => { watching: boolean }; stop: () => void; readonly watching: boolean };
export declare function sanitizePresenceEvent(value: unknown): PresenceEvent | null;
export declare function absenceStartMs(event: { atMs: number; idleSeconds: number }): number;

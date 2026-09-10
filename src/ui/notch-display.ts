import type { DictionaryKey } from '../i18n/dictionary';

export type NotchDisplay = Readonly<{ id: number; label: string; primary: boolean; internal: boolean; hasCameraHousing: boolean; width: number; height: number }>;
export type NotchDisplayState = Readonly<{
  preference: Readonly<{ displayId: number | null; displayLabel: string }>;
  resolvedDisplayId: number;
  reason: 'preferred' | 'camera-housing' | 'primary';
  displays: readonly NotchDisplay[];
}>;
export type NotchTestOutcome = 'confirmed' | 'declined' | 'timeout' | 'busy' | 'interrupted' | 'failed';
export type NotchTestResult = Readonly<{ outcome: NotchTestOutcome; displayId: number | null; displayLabel: string }>;
export type NotchDisplayOption = Readonly<{ value: string; label: string; disabled: boolean }>;
type Translate = (key: DictionaryKey) => string;

export const AUTO_NOTCH_VALUE = 'auto';

const RESULT_KEYS: Record<NotchTestOutcome, DictionaryKey> = {
  confirmed: 'settings.notch.result.confirmed',
  declined: 'settings.notch.result.declined',
  timeout: 'settings.notch.result.timeout',
  busy: 'settings.notch.result.busy',
  interrupted: 'settings.notch.result.interrupted',
  failed: 'settings.notch.result.failed',
};

export const disconnectedPreference = (state: NotchDisplayState): boolean =>
  state.preference.displayId !== null && !state.displays.some((display) => display.id === state.preference.displayId);

export const selectedNotchValue = (state: NotchDisplayState): string =>
  state.preference.displayId === null ? AUTO_NOTCH_VALUE : String(state.preference.displayId);

export const resolvedNotchDisplay = (state: NotchDisplayState): NotchDisplay | undefined =>
  state.displays.find((display) => display.id === state.resolvedDisplayId);

export function notchDisplayOptions(state: NotchDisplayState, t: Translate): NotchDisplayOption[] {
  const resolved = resolvedNotchDisplay(state);
  const options: NotchDisplayOption[] = [
    { value: AUTO_NOTCH_VALUE, label: resolved ? `${t('settings.notch.auto')} · ${resolved.label}` : t('settings.notch.auto'), disabled: false },
    ...state.displays.map((display) => ({
      value: String(display.id),
      label: [display.label, display.hasCameraHousing ? t('settings.notch.withNotch') : null, display.primary ? t('settings.notch.primary') : null].filter(Boolean).join(' · '),
      disabled: false,
    })),
  ];
  if (disconnectedPreference(state)) {
    options.push({ value: String(state.preference.displayId), label: `${state.preference.displayLabel || t('settings.notch.unknownDisplay')} · ${t('settings.notch.disconnected')}`, disabled: true });
  }
  return options;
}

export const notchTestMessage = (result: NotchTestResult, t: Translate): string =>
  t(RESULT_KEYS[result.outcome]).replace('{display}', result.displayLabel || t('settings.notch.unknownDisplay'));

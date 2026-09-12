import { DEFAULT_FOCUS_SETTINGS, NUDGE_PRESETS, SESSION_LENGTHS, countDailyAlerts, sanitizeFocusSettings, type FocusSettings, type NudgePreset } from '../../electron/focus-gate.mjs'
import { nextOccurrence } from '../../electron/notifications.mjs'
import type { NotificationEntry } from '../domain/notifications'

// Os ajustes de Foco moram no MESMO módulo que o portão: o valor lido daqui é o valor que o agendador
// aplica, sem tradução no meio. `sanitizeFocusSettings` é a única porta de entrada, então um valor
// corrompido no armazenamento vira o padrão em vez de derrubar a tela ou silenciar o app.
export { DEFAULT_FOCUS_SETTINGS, NUDGE_PRESETS, SESSION_LENGTHS, sanitizeFocusSettings }
export type { FocusSettings, NudgePreset }

export const FOCUS_SETTINGS_STORAGE_KEY = 'hibi-focus-settings'

export type FocusSettingsHost = Readonly<{
  storage: Pick<Storage, 'getItem' | 'setItem'>
}>

export const readFocusSettings = (storage: Pick<Storage, 'getItem'>): FocusSettings => {
  try { return sanitizeFocusSettings(JSON.parse(storage.getItem(FOCUS_SETTINGS_STORAGE_KEY) ?? 'null')) }
  catch { return sanitizeFocusSettings(undefined) }
}

export const writeFocusSettings = (storage: Pick<Storage, 'setItem'>, settings: FocusSettings): void => {
  try { storage.setItem(FOCUS_SETTINGS_STORAGE_KEY, JSON.stringify(sanitizeFocusSettings(settings))) } catch { /* armazenamento indisponível */ }
}

const noopStorage: Pick<Storage, 'getItem' | 'setItem'> = { getItem: () => null, setItem: () => undefined }

// window.localStorage pode lançar (política de armazenamento restritiva, contexto embutido sem
// suporte); cai para no-op para o app sempre conseguir montar.
const safeStorage = (): Pick<Storage, 'getItem' | 'setItem'> => {
  try { return window.localStorage } catch { return noopStorage }
}

export const browserFocusSettingsHost = (): FocusSettingsHost => ({ storage: safeStorage() })

/**
 * Quantos alertas estes ajustes produzem hoje.
 *
 * Não é uma estimativa paralela: `countDailyAlerts` chama `nextDelivery` — a MESMA função que o
 * agendador usa para armar cada timer — e percorre as ocorrências com o MESMO `nextOccurrence`. Uma
 * prévia capaz de discordar da realidade é exatamente como "09:00–17:00" virou enfeite no app
 * original. Há testes dos dois lados prendendo essa igualdade.
 *
 * O início do dia é montado com os componentes LOCAIS da data: `toISOString()` daria o dia UTC, que
 * em São Paulo já é o seguinte depois das 21h.
 */
export const previewDailyAlerts = (entries: readonly NotificationEntry[], settings: FocusSettings, today: Date = new Date()): number =>
  countDailyAlerts({ entries, settings, dayStartMs: new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime(), nextOccurrence })

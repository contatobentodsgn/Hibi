import type { Locale } from './format'

export const LANGUAGE_STORAGE_KEY = 'hibi-language'
export const TIME_FORMAT_STORAGE_KEY = 'hibi-twenty-four-hour'

export type LocaleHost = Readonly<{
  storage: Pick<Storage, 'getItem' | 'setItem'>
}>

export const readLanguage = (storage: Pick<Storage, 'getItem'>): Locale => {
  try { const saved = storage.getItem(LANGUAGE_STORAGE_KEY); return saved === 'en' ? 'en' : 'pt' } catch { return 'pt' }
}

// Qualquer valor diferente da string 'false' significa 24h — uma chave ausente também significa 24h.
export const readTwentyFourHour = (storage: Pick<Storage, 'getItem'>): boolean => {
  try { return storage.getItem(TIME_FORMAT_STORAGE_KEY) !== 'false' } catch { return true }
}

export const writeLanguage = (storage: Pick<Storage, 'setItem'>, language: Locale): void => {
  try { storage.setItem(LANGUAGE_STORAGE_KEY, language) } catch { /* armazenamento indisponível */ }
}

export const writeTwentyFourHour = (storage: Pick<Storage, 'setItem'>, twentyFourHour: boolean): void => {
  try { storage.setItem(TIME_FORMAT_STORAGE_KEY, String(twentyFourHour)) } catch { /* armazenamento indisponível */ }
}

const noopStorage: Pick<Storage, 'getItem' | 'setItem'> = { getItem: () => null, setItem: () => undefined }

// window.localStorage pode lançar (política de armazenamento restritiva, contexto embutido sem
// suporte); cai para no-op para o app sempre conseguir montar.
const safeStorage = (): Pick<Storage, 'getItem' | 'setItem'> => {
  try { return window.localStorage } catch { return noopStorage }
}

export const browserLocaleHost = (): LocaleHost => ({ storage: safeStorage() })

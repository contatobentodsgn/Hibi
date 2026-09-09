import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { translate, type DictionaryKey } from './dictionary'
import { formatDate, formatRange, formatTime, formatWeekday, type FormatOptions, type Locale } from './format'

export const LANGUAGE_STORAGE_KEY = 'hibi-language'
export const TIME_FORMAT_STORAGE_KEY = 'hibi-twenty-four-hour'

type LocaleContextValue = Readonly<{ language: Locale; setLanguage: (language: Locale) => void }>
const LocaleContext = createContext<LocaleContextValue>({ language: 'pt', setLanguage: () => undefined })

const readLanguage = (): Locale => { try { const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY); return saved === 'en' ? 'en' : 'pt' } catch { return 'pt' } }
const readTwentyFourHour = () => { try { return window.localStorage.getItem(TIME_FORMAT_STORAGE_KEY) !== 'false' } catch { return true } }

export function LocaleProvider({ children, initialLanguage }: { children: React.ReactNode; initialLanguage?: Locale }) {
  const [language, setLanguageState] = useState<Locale>(() => initialLanguage ?? readLanguage())
  const setLanguage = (next: Locale) => { setLanguageState(next); try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next) } catch { /* armazenamento indisponível */ } }
  useEffect(() => { document.documentElement.lang = language === 'pt' ? 'pt-BR' : 'en' }, [language])
  const value = useMemo(() => ({ language, setLanguage }), [language])
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export const useLocale = () => useContext(LocaleContext)

export function useT() {
  const { language } = useLocale()
  return (key: DictionaryKey) => translate(language, key)
}

// Lê a preferência de 24h a cada render: quem a grava é Ajustes, fora deste contexto.
export function useFormat() {
  const { language } = useLocale()
  const options: FormatOptions = { locale: language, twentyFourHour: readTwentyFourHour() }
  return {
    time: (iso: string) => formatTime(iso, options),
    date: (iso: string) => formatDate(iso, options),
    weekday: (iso: string) => formatWeekday(iso, options),
    range: (start: string, end: string) => formatRange(start, end, options),
  }
}

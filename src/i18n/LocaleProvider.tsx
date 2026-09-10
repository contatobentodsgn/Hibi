import React, { createContext, useContext, useEffect, useState } from 'react'
import { translate, type DictionaryKey } from './dictionary'
import { formatDate, formatRange, formatTime, formatWeekday, type FormatOptions, type Locale } from './format'
import { browserLocaleHost, readLanguage, readTwentyFourHour, writeLanguage, writeTwentyFourHour, type LocaleHost } from './locale-storage'

export { LANGUAGE_STORAGE_KEY, TIME_FORMAT_STORAGE_KEY } from './locale-storage'

type LocaleContextValue = Readonly<{
  language: Locale
  setLanguage: (language: Locale) => void
  twentyFourHour: boolean
  setTwentyFourHour: (twentyFourHour: boolean) => void
}>
const LocaleContext = createContext<LocaleContextValue>({
  language: 'pt',
  setLanguage: () => undefined,
  twentyFourHour: true,
  setTwentyFourHour: () => undefined,
})

// `host` é opcional para testes injetarem um fake; em produção cai para browserLocaleHost(),
// construído de forma preguiçosa (dentro do useState) para que importar este módulo nunca toque em `window`.
export function LocaleProvider({ children, initialLanguage, host }: { children: React.ReactNode; initialLanguage?: Locale; host?: LocaleHost }) {
  const [localeHost] = useState<LocaleHost>(() => host ?? browserLocaleHost())
  const [language, setLanguageState] = useState<Locale>(() => initialLanguage ?? readLanguage(localeHost.storage))
  const [twentyFourHour, setTwentyFourHourState] = useState<boolean>(() => readTwentyFourHour(localeHost.storage))
  useEffect(() => { document.documentElement.lang = language === 'pt' ? 'pt-BR' : 'en' }, [language])

  const setLanguage = (next: Locale) => { setLanguageState(next); writeLanguage(localeHost.storage, next) }
  const setTwentyFourHour = (next: boolean) => { setTwentyFourHourState(next); writeTwentyFourHour(localeHost.storage, next) }

  return <LocaleContext.Provider value={{ language, setLanguage, twentyFourHour, setTwentyFourHour }}>{children}</LocaleContext.Provider>
}

export const useLocale = () => useContext(LocaleContext)

export function useT() {
  const { language } = useLocale()
  return (key: DictionaryKey) => translate(language, key)
}

export function useFormat() {
  const { language, twentyFourHour } = useLocale()
  const options: FormatOptions = { locale: language, twentyFourHour }
  return {
    time: (iso: string) => formatTime(iso, options),
    date: (iso: string) => formatDate(iso, options),
    weekday: (iso: string) => formatWeekday(iso, options),
    range: (start: string, end: string) => formatRange(start, end, options),
  }
}

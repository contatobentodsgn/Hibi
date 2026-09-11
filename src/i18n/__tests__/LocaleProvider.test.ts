import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LANGUAGE_STORAGE_KEY, TIME_FORMAT_STORAGE_KEY, type LocaleHost } from '../locale-storage'
import { LocaleProvider, useFormat, useLocale, useT } from '../LocaleProvider'

const host = (language: string | null = null, twentyFourHour: string | null = null): LocaleHost & { store: Map<string, string> } => {
  const store = new Map<string, string>()
  if (language !== null) store.set(LANGUAGE_STORAGE_KEY, language)
  if (twentyFourHour !== null) store.set(TIME_FORMAT_STORAGE_KEY, twentyFourHour)
  return {
    store,
    storage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => { store.set(key, value) } },
  }
}

describe('LocaleProvider', () => {
  const LanguageConsumer = () => {
    const { language } = useLocale()
    return React.createElement('span', null, language)
  }

  it('lê o idioma guardado no host fake', () => {
    const fake = host('en')
    const markup = renderToStaticMarkup(React.createElement(LocaleProvider, { host: fake, children: React.createElement(LanguageConsumer) }))
    expect(markup).toContain('en')
  })

  it('cai em pt quando a leitura do host fake lança', () => {
    const fake = host('en')
    fake.storage.getItem = () => { throw new Error('indisponível') }
    const markup = renderToStaticMarkup(React.createElement(LocaleProvider, { host: fake, children: React.createElement(LanguageConsumer) }))
    expect(markup).toContain('pt')
  })

  it('cai em pt para valores inválidos no host fake', () => {
    const fake = host('fr')
    const markup = renderToStaticMarkup(React.createElement(LocaleProvider, { host: fake, children: React.createElement(LanguageConsumer) }))
    expect(markup).toContain('pt')
  })

  it('useT traduz pelo idioma ativo', () => {
    const TranslatedConsumer = () => {
      const t = useT()
      return React.createElement('span', null, t('nav.tasks'))
    }
    const fake = host('en')
    const markup = renderToStaticMarkup(React.createElement(LocaleProvider, { host: fake, children: React.createElement(TranslatedConsumer) }))
    expect(markup).toContain('Tasks')

    const fakePt = host('pt')
    const markupPt = renderToStaticMarkup(React.createElement(LocaleProvider, { host: fakePt, children: React.createElement(TranslatedConsumer) }))
    expect(markupPt).toContain('Tarefas')
  })

  it('useFormat honra a preferência de 24h vinda do contexto', () => {
    const FormatConsumer = () => {
      const format = useFormat()
      return React.createElement('span', null, format.time('2026-09-07T09:00:00'))
    }

    const twentyFourFake = host('en', 'true')
    const twentyFourMarkup = renderToStaticMarkup(React.createElement(LocaleProvider, { host: twentyFourFake, children: React.createElement(FormatConsumer) }))
    expect(twentyFourMarkup).toContain('09:00')

    const twelveHourFake = host('en', 'false')
    const twelveHourMarkup = renderToStaticMarkup(React.createElement(LocaleProvider, { host: twelveHourFake, children: React.createElement(FormatConsumer) }))
    expect(twelveHourMarkup).toContain('9:00 AM')
  })

  it('useFormat usa 24h por padrão quando a chave está ausente', () => {
    const FormatConsumer = () => {
      const format = useFormat()
      return React.createElement('span', null, format.time('2026-09-07T09:00:00'))
    }
    const fake = host('en')
    const markup = renderToStaticMarkup(React.createElement(LocaleProvider, { host: fake, children: React.createElement(FormatConsumer) }))
    expect(markup).toContain('09:00')
  })

  it('trocar de idioma persiste através do host', () => {
    const fake = host('pt')
    let setLanguage: ((language: 'pt' | 'en') => void) | undefined
    const Capture = () => {
      const locale = useLocale()
      setLanguage = locale.setLanguage
      return null
    }
    renderToStaticMarkup(React.createElement(LocaleProvider, { host: fake, children: React.createElement(Capture) }))
    expect(fake.store.get(LANGUAGE_STORAGE_KEY)).toBe('pt')
    setLanguage?.('en')
    expect(fake.store.get(LANGUAGE_STORAGE_KEY)).toBe('en')
  })

  it('trocar a preferência de 24h persiste através do host', () => {
    const fake = host('pt', 'true')
    let setTwentyFourHour: ((value: boolean) => void) | undefined
    const Capture = () => {
      const locale = useLocale()
      setTwentyFourHour = locale.setTwentyFourHour
      return null
    }
    renderToStaticMarkup(React.createElement(LocaleProvider, { host: fake, children: React.createElement(Capture) }))
    setTwentyFourHour?.(false)
    expect(fake.store.get(TIME_FORMAT_STORAGE_KEY)).toBe('false')
  })

  it('initialLanguage tem prioridade sobre o host na primeira renderização', () => {
    const fake = host('en')
    const markup = renderToStaticMarkup(React.createElement(LocaleProvider, { host: fake, initialLanguage: 'pt', children: React.createElement(LanguageConsumer) }))
    expect(markup).toContain('pt')
  })
})

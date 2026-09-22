import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LocaleProvider } from '../../i18n/LocaleProvider'
import { StatsScreen } from '../redesign/screens/StatsScreen'
import { SettingsScreen } from '../redesign/settings/SettingsScreen'
import { createSeedData } from '../../data/seed-data'

const data = createSeedData()
const noop = () => undefined

describe('U18/U20 redesign surfaces', () => {
  it('mantém Estatísticas dentro da superfície redesign', () => {
    const markup = renderToStaticMarkup(<LocaleProvider><StatsScreen records={data.activity} referenceDate={new Date('2026-09-22T12:00:00')} onEvent={noop} /></LocaleProvider>)
    expect(markup).toContain('data-screen="stats"')
    expect(markup).toContain('stats-view')
  })

  it('expõe a navegação agrupada de Ajustes e busca interna', () => {
    const markup = renderToStaticMarkup(<LocaleProvider><SettingsScreen data={data} onEvent={noop} onReset={noop} /></LocaleProvider>)
    expect(markup).toContain('data-screen="settings"')
    expect(markup).toContain('settings-navigation')
    expect(markup).toContain('Pesquisar ajustes')
    expect(markup).toContain('Aparência')
    expect(markup).toContain('Taby e voz')
  })
})

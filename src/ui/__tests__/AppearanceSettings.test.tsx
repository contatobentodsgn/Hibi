import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LocaleProvider } from '../../i18n/LocaleProvider'
import { NavigationPreferencesProvider } from '../shell/NavigationPreferencesProvider'
import { NAVIGATION_POSITION_KEY } from '../shell/navigation-preferences'
import { AppearanceSettings } from '../redesign/settings/AppearanceSettings'

const render = (storage: Pick<Storage, 'getItem' | 'setItem'> | null = null, language: 'pt' | 'en' = 'pt') =>
  renderToStaticMarkup(<LocaleProvider initialLanguage={language}><NavigationPreferencesProvider storage={storage}><AppearanceSettings onEvent={() => undefined} /></NavigationPreferencesProvider></LocaleProvider>)
describe('Aparência (U04)', () => {
  it('traz as seções do preview e a posição da barra, com o padrão de cada uma marcado', () => {
    const markup = render()
    for (const text of ['Aparência', 'A mesma companhia. A sua atmosfera.', 'Tema', 'Escolha a luz do seu espaço.', 'Um toque de cor', 'Nos detalhes, sem chamar mais atenção que você.', 'Menu de navegação', 'Reduzir movimento', 'Mais contraste']) expect(markup).toContain(`>${text}<`)
    // O rótulo vem depois do ícone de cada opção (e antes do visto, na escolhida).
    for (const label of ['Claro', 'Escuro', 'Sistema', 'Superior', 'Inferior']) expect(markup).toMatch(new RegExp(`</svg>${label}<`))
    // O tom atual aparece na etiqueta, e cada amostra tem nome para o leitor de tela.
    expect(markup).toMatch(/class="hibi-tag">Lavanda</)
    for (const tint of ['Lavanda', 'Azul', 'Menta', 'Pêssego']) expect(markup).toContain(`aria-label="${tint}"`)
    expect(markup.match(/type="radio"/g)).toHaveLength(3 + 4 + 2)
    expect(markup.match(/role="switch"/g)).toHaveLength(2)
    // Sem preferência, o tema segue o sistema e a barra fica em cima.
    expect(markup).toMatch(/value="system"[^>]*checked=""|checked=""[^>]*value="system"/)
    expect(markup).toMatch(/value="top"[^>]*checked=""|checked=""[^>]*value="top"/)
  })

  it('mostra a posição guardada, e o inglês vem do dicionário', () => {
    const storage = { getItem: (key: string) => (key === NAVIGATION_POSITION_KEY ? 'bottom' : null), setItem: () => undefined }
    const markup = render(storage, 'en')
    expect(markup).toMatch(/value="bottom"[^>]*checked=""|checked=""[^>]*value="bottom"/)
    for (const text of ['Appearance', 'A touch of colour', 'Navigation menu', 'Reduce motion', 'More contrast']) expect(markup).toContain(`>${text}<`)
  })
})

import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LocaleProvider } from '../../i18n/LocaleProvider'
import { AppShell } from '../shell/AppShell'
import { Dock, DockMoreMenu } from '../shell/Dock'
import { dockKeyFor, DOCK_ITEMS, MORE_ITEMS, nextFocusIndex, sectionLabelKey } from '../shell/routes'
import { cssBlock } from './css-block'

const noop = () => undefined

describe('shell', () => {
  it('mostra os cinco itens do dock, o botão de mais e o atalho de comandos', () => {
    const markup = renderToStaticMarkup(<Dock active="home" onNavigate={noop} onOpenCommands={noop} />)
    for (const label of ['Home', 'Tarefas', 'Agenda', 'Foco', 'Taby']) expect(markup).toContain(`>${label}</button>`)
    expect(markup).toContain('aria-label="Mais seções"')
    expect(markup).toContain('aria-label="Comandos"')
    expect(markup).toContain('aria-current="page"')
  })

  it('lista o restante das seções no menu de mais', () => {
    const markup = renderToStaticMarkup(<DockMoreMenu active="settings" onSelect={noop} />)
    for (const label of ['Lembretes', 'Notas', 'Hábitos', 'Metas', 'Revisão', 'Estatísticas', 'Ajustes', 'Ajuda', 'Eventos', 'Feedback', 'Atualizações', 'Hardware']) expect(markup).toContain(label)
    expect(markup).toContain('role="menuitem"')
    expect(markup).toMatch(/aria-current="page"[^>]*>Ajustes</)
  })

  it('traduz o dock ao vivo pelo provedor de locale', () => {
    const markup = renderToStaticMarkup(<LocaleProvider initialLanguage="en"><Dock active="tasks" onNavigate={noop} onOpenCommands={noop} /></LocaleProvider>)
    expect(markup).toContain('>Tasks</button>')
    expect(markup).toContain('aria-label="More sections"')
  })

  it('agrupa dia, semana e agenda no mesmo item do dock', () => {
    expect(dockKeyFor('day')).toBe('agenda')
    expect(dockKeyFor('week')).toBe('agenda')
    expect(dockKeyFor('agenda')).toBe('agenda')
    expect(dockKeyFor('settings')).toBe('settings')
    expect(sectionLabelKey('week')).toBe('nav.agenda')
    expect(sectionLabelKey('instrumentation')).toBe('nav.instrumentation')
    expect(sectionLabelKey('stats')).toBe('nav.stats')
    expect(DOCK_ITEMS.map((item) => item.key)).toEqual(['home', 'tasks', 'agenda', 'focus', 'taby'])
    expect(MORE_ITEMS).toHaveLength(12)
    expect(MORE_ITEMS.map((item) => item.key)).toContain('stats')
    // /stats abre uma página dedicada, logo em seguida de Revisão no menu.
    const reviewIndex = MORE_ITEMS.findIndex((item) => item.key === 'review')
    expect(MORE_ITEMS[reviewIndex + 1]).toEqual({ key: 'stats', label: 'nav.stats' })
  })

  it('agrupa a pausa no item Foco do dock', () => {
    expect(dockKeyFor('break')).toBe('focus')
    expect(sectionLabelKey('break')).toBe('nav.focus')
    const markup = renderToStaticMarkup(<Dock active="break" onNavigate={noop} onOpenCommands={noop} />)
    expect(markup).toMatch(/aria-current="page"[^>]*>Foco</)
  })

  it('envolve o conteúdo com a faixa do topo e a seção atual', () => {
    const markup = renderToStaticMarkup(<AppShell active="week" onNavigate={noop} onOpenCommands={noop}><p>conteúdo</p></AppShell>)
    expect(markup).toContain('HIBI')
    expect(markup).toContain('>Agenda</span>')
    expect(markup).toContain('<main class="shell-content"><p>conteúdo</p></main>')
  })

  it('mantém o canvas contínuo e limita o conteúdo legado sem borda escura indevida', () => {
    const shellCss = readFileSync(new URL('../shell/shell.css', import.meta.url), 'utf8')
    expect(shellCss).toContain('background: var(--bg-canvas); }')
    expect(shellCss).toContain('max-width: none;')
    expect(shellCss).toContain('padding: 0 0 120px;')
  })

  it('mantém a ilha clara legada (.legacy-surface) honesta com os tokens claros reais', () => {
    const shellCss = readFileSync(new URL('../shell/shell.css', import.meta.url), 'utf8')
    const tokensCss = readFileSync(new URL('../tokens.css', import.meta.url), 'utf8')
    const island = cssBlock(shellCss, '.legacy-surface')
    const light = cssBlock(tokensCss, ':root')
    const covered = ['--bg-canvas', '--text-primary', '--text-secondary', '--stroke-default', '--accent', '--cat-break-soft', '--cat-learning-soft', '--cat-important-soft']
    for (const name of covered) expect(island[name], `${name} falta na ilha`).toBe(light[name])
  })

  it('aplica a camada visual refinada do sistema de design', () => {
    const css = readFileSync(new URL('../refined-ui.css', import.meta.url), 'utf8')
    expect(css).toContain('--ui-signal-blue: #0088ff')
    expect(css).toContain('.view {')
    expect(css).toContain('1200px')
    expect(css).toContain('border-radius: 100px')
  })

  it('reserva um layout vertical para o formulário de feedback', () => {
    const css = readFileSync(new URL('../refined-ui.css', import.meta.url), 'utf8')
    expect(css).toContain('.feedback-form')
    expect(css).toContain('display: grid')
  })

  describe('nextFocusIndex', () => {
    it('avança com wrap-around no fim da lista', () => {
      expect(nextFocusIndex(0, 3, 'ArrowRight')).toBe(1)
      expect(nextFocusIndex(2, 3, 'ArrowRight')).toBe(0)
    })

    it('recua com wrap-around no início da lista', () => {
      expect(nextFocusIndex(1, 3, 'ArrowLeft')).toBe(0)
      expect(nextFocusIndex(0, 3, 'ArrowLeft')).toBe(2)
    })

    it('Home vai para o primeiro item e End para o último', () => {
      expect(nextFocusIndex(2, 5, 'Home')).toBe(0)
      expect(nextFocusIndex(0, 5, 'End')).toBe(4)
    })

    it('índice atual fora do intervalo começa do primeiro ao avançar e do último ao retroceder', () => {
      expect(nextFocusIndex(-1, 4, 'ArrowDown')).toBe(0)
      expect(nextFocusIndex(-1, 4, 'ArrowUp')).toBe(3)
      expect(nextFocusIndex(99, 4, 'ArrowRight')).toBe(0)
      expect(nextFocusIndex(-1, 0, 'ArrowDown')).toBe(-1)
    })
  })
})

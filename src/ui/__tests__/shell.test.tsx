import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LocaleProvider } from '../../i18n/LocaleProvider'
import { AppShell } from '../shell/AppShell'
import { Dock, DockMoreMenu } from '../shell/Dock'
import { dockKeyFor, DOCK_ITEMS, MORE_ITEMS, sectionLabelKey } from '../shell/routes'

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
    for (const label of ['Lembretes', 'Notas', 'Hábitos', 'Metas', 'Revisão', 'Ajustes', 'Ajuda', 'Eventos', 'Feedback', 'Atualizações', 'Hardware']) expect(markup).toContain(label)
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
    expect(DOCK_ITEMS.map((item) => item.key)).toEqual(['home', 'tasks', 'agenda', 'focus', 'taby'])
    expect(MORE_ITEMS).toHaveLength(11)
  })

  it('envolve o conteúdo com a faixa do topo e a seção atual', () => {
    const markup = renderToStaticMarkup(<AppShell active="week" onNavigate={noop} onOpenCommands={noop}><p>conteúdo</p></AppShell>)
    expect(markup).toContain('HIBI')
    expect(markup).toContain('>Agenda</span>')
    expect(markup).toContain('<main class="shell-content"><p>conteúdo</p></main>')
  })
})

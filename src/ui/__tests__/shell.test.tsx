import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LocaleProvider } from '../../i18n/LocaleProvider'
import { AppShell } from '../shell/AppShell'
import { ariaCurrentFor, breadcrumbFor, DESTINATIONS, destinationFor, MORE_ITEMS, nextFocusIndex, sectionLabelKey, type NavKey } from '../shell/routes'
import { cssBlock } from './css-block'

const noop = () => undefined
const shell = (active: NavKey) => renderToStaticMarkup(<AppShell active={active} onNavigate={noop} onOpenCommands={noop}><p>conteúdo</p></AppShell>)
// Os botões marcados como a página atual (ou, com `true`, como a seção onde ela mora), pelo texto de cada um.
const current = (markup: string, value: 'page' | 'true' = 'page') => [...markup.matchAll(new RegExp(`<button[^>]*aria-current="${value}"[^>]*>(.*?)</button>`, 'g'))].map((match) => match[1]!.replace(/<[^>]+>/g, ''))

describe('shell', () => {
  it('mostra os cinco destinos na ordem do plano, a busca de comandos, o Mais e Ajustes', () => {
    const markup = shell('home')
    const labels = [...markup.matchAll(/<li><button[^>]*>.*?<span class="leading-none">([^<]+)<\/span>/g)].map((match) => match[1])
    // A barra larga e o menu compacto listam os mesmos destinos.
    expect(labels).toEqual(['Hoje', 'Agenda', 'Tarefas', 'Notas', 'Taby'])
    expect(markup).toContain('aria-label="Navegação principal"')
    expect(markup).toContain('aria-label="Comandos"')
    expect(markup).toContain('aria-label="Mais seções"')
    expect(markup).toMatch(/<button[^>]*>.*?Ajustes<\/button>/)
    expect(current(markup)).toEqual(['Hoje', 'Hoje'])
  })

  it('traduz a barra ao vivo pelo provedor de locale', () => {
    const markup = renderToStaticMarkup(<LocaleProvider initialLanguage="en"><AppShell active="tasks" onNavigate={noop} onOpenCommands={noop}><p /></AppShell></LocaleProvider>)
    expect(markup).toContain('>Today</span>')
    expect(markup).toContain('aria-label="More sections"')
    expect(markup).toMatch(/Settings<\/button>/)
    expect(current(markup)).toEqual(['Tasks', 'Tasks'])
  })

  it('marca o destino onde a rota mora como a seção, e a trilha marca a página', () => {
    const reminders = shell('reminders')
    expect(current(reminders, 'true')).toEqual(['Tarefas', 'Tarefas'])
    expect(current(reminders)).toEqual([])
    expect(reminders).toMatch(/Meu espaço<\/li>.*Tarefas<\/li>.*<strong aria-current="page"[^>]*>Lembretes<\/strong>/)

    const help = shell('help')
    expect(current(help, 'true')).toEqual(['Ajustes', 'Ajustes'])
    expect(current(help)).toEqual([])
    expect(help).toMatch(/Ajustes<\/li>.*>Ajuda<\/strong>/)

    // Na própria página do destino (ou de Ajustes), a barra marca a página.
    expect(current(shell('settings'))).toEqual(['Ajustes', 'Ajustes'])
    expect(current(shell('week'))).toEqual(['Agenda', 'Agenda'])
    expect(current(shell('week'), 'true')).toEqual([])
  })

  it('não marca destino nenhum na sessão de foco, e o menu compacto diz onde a pessoa está', () => {
    for (const route of ['focus', 'break'] as const) {
      const markup = shell(route)
      expect(current(markup)).toEqual([])
      expect(markup).toContain('aria-label="Foco, mudar de seção"')
    }
  })

  it('embrulha o conteúdo com a faixa do topo e deixa o menu compacto fora do Tab enquanto fechado', () => {
    const markup = shell('week')
    expect(markup).toContain('<main class="shell-content"><p>conteúdo</p></main>')
    expect(markup).toMatch(/<strong aria-current="page"[^>]*>Agenda<\/strong>/)
    expect(markup).toMatch(/<div data-notch-drawer="" inert=""/)
    // A moldura e o conteúdo das telas atuais ficam fora de `.hibi-ui`; a barra vem antes do conteúdo na
    // árvore, como no preview, e o Tab chega aos destinos antes da tela.
    expect(markup.indexOf('notch-frame')).toBeLessThan(markup.indexOf('hibi-ui'))
    expect(markup.indexOf('class="hibi-ui notch-layer')).toBeLessThan(markup.indexOf('<main'))
    expect(markup.indexOf('class="hibi-ui notch-layer')).toBeLessThan(markup.indexOf('class="notch-viewport'))
  })

  it('resolve cada rota antiga para o lugar dela na nova arquitetura (seção 3.1 do plano)', () => {
    const places: Record<NavKey, ReturnType<typeof destinationFor>> = {
      home: 'home', habits: 'home', goals: 'home', stats: 'home', review: 'home',
      agenda: 'agenda', day: 'agenda', week: 'agenda',
      tasks: 'tasks', reminders: 'tasks',
      notes: 'notes', taby: 'taby',
      focus: null, break: null,
      settings: 'settings', help: 'settings', feedback: 'settings', instrumentation: 'settings', updates: 'settings', hardware: 'settings',
    }
    for (const [route, place] of Object.entries(places)) expect(destinationFor(route as NavKey), route).toBe(place)
  })

  it('deixa toda rota alcançável: pela barra, pelo Mais ou pelo botão de Ajustes', () => {
    expect(DESTINATIONS.map((item) => item.key)).toEqual(['home', 'agenda', 'tasks', 'notes', 'taby'])
    expect(MORE_ITEMS.map((item) => item.key)).toEqual(['focus', 'reminders', 'habits', 'goals', 'review', 'stats'])
    const reachable = new Set<NavKey>([...DESTINATIONS.map((item) => item.key), ...MORE_ITEMS.map((item) => item.key), 'settings', 'help', 'feedback', 'instrumentation', 'updates', 'hardware'])
    // Dia e Semana são modos da Agenda; a pausa é um modo do Foco.
    for (const route of Object.keys({ home: 0, tasks: 0, agenda: 0, focus: 0, taby: 0, notes: 0, reminders: 0, habits: 0, goals: 0, review: 0, stats: 0, settings: 0, help: 0, feedback: 0, instrumentation: 0, updates: 0, hardware: 0 }) as NavKey[]) expect(reachable.has(route), route).toBe(true)
  })

  it('marca a própria página do lugar como página, e uma tela dentro dele como a seção', () => {
    for (const route of ['home', 'agenda', 'day', 'week', 'tasks', 'notes', 'taby', 'settings'] as const) expect(ariaCurrentFor(route), route).toBe('page')
    for (const route of ['habits', 'goals', 'stats', 'review', 'reminders', 'help', 'feedback', 'instrumentation', 'updates', 'hardware'] as const) expect(ariaCurrentFor(route), route).toBe('true')
  })

  it('dá a cada rota a trilha e o nome de seção certos', () => {
    expect(breadcrumbFor('home')).toEqual(['redesign.nav.today'])
    expect(breadcrumbFor('habits')).toEqual(['redesign.nav.today', 'nav.habits'])
    expect(breadcrumbFor('day')).toEqual(['nav.agenda'])
    expect(breadcrumbFor('settings')).toEqual(['nav.settings'])
    expect(breadcrumbFor('updates')).toEqual(['nav.settings', 'nav.updates'])
    expect(breadcrumbFor('break')).toEqual(['nav.focus'])
    expect(sectionLabelKey('week')).toBe('nav.agenda')
    expect(sectionLabelKey('instrumentation')).toBe('nav.instrumentation')
  })

  it('mantém a ilha clara legada (.legacy-surface) honesta com os tokens claros reais', () => {
    const shellCss = readFileSync(new URL('../shell/shell.css', import.meta.url), 'utf8')
    const tokensCss = readFileSync(new URL('../tokens.css', import.meta.url), 'utf8')
    const island = cssBlock(shellCss, '.legacy-surface')
    const light = cssBlock(tokensCss, ':root')
    const covered = ['--bg-canvas', '--text-primary', '--text-secondary', '--stroke-default', '--accent', '--cat-break-soft', '--cat-learning-soft', '--cat-important-soft']
    for (const name of covered) expect(island[name], `${name} falta na ilha`).toBe(light[name])
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

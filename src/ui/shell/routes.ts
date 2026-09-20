import type { DictionaryKey } from '../../i18n/dictionary'

export type NavKey = 'home' | 'tasks' | 'agenda' | 'day' | 'week' | 'focus' | 'break' | 'taby' | 'notes' | 'reminders' | 'habits' | 'goals' | 'review' | 'stats' | 'settings' | 'help' | 'feedback' | 'instrumentation' | 'updates' | 'hardware'

export type NavItem = Readonly<{ key: NavKey; label: DictionaryKey }>

/** Os destinos do menu principal da nova UI (seção 3.1 do plano). */
export type DestinationKey = 'home' | 'agenda' | 'tasks' | 'notes' | 'taby'

// O menu principal, nesta ordem: Hoje · Agenda · Tarefas · Notas · Taby. Ajustes tem acesso próprio.
export const DESTINATIONS: readonly Readonly<{ key: DestinationKey; label: DictionaryKey }>[] = [
  { key: 'home', label: 'redesign.nav.today' },
  { key: 'agenda', label: 'nav.agenda' },
  { key: 'tasks', label: 'nav.tasks' },
  { key: 'notes', label: 'nav.notes' },
  { key: 'taby', label: 'nav.taby' },
]

// O menu "Mais" é provisório: guarda as rotas que ainda não têm acesso pelo contexto (Hoje, Tarefas e
// Ajustes) e sai na U19, quando todos os acessos substitutos existirem. Até lá, tudo continua a um clique.
export const MORE_ITEMS: readonly NavItem[] = [
  { key: 'focus', label: 'nav.focus' },
  { key: 'reminders', label: 'nav.reminders' },
  { key: 'habits', label: 'nav.habits' },
  { key: 'goals', label: 'nav.goals' },
  { key: 'review', label: 'nav.review' },
  { key: 'stats', label: 'nav.stats' },
  { key: 'help', label: 'nav.help' },
  { key: 'instrumentation', label: 'nav.instrumentation' },
  { key: 'feedback', label: 'nav.feedback' },
  { key: 'updates', label: 'nav.updates' },
  { key: 'hardware', label: 'nav.hardware' },
]

// Onde cada rota antiga mora na nova arquitetura (tabela da seção 3.1 do plano). O `Record` obriga toda
// rota a ter um lugar: nenhuma fica órfã. A sessão de foco e a pausa não pertencem a um destino.
const PLACE: Readonly<Record<NavKey, DestinationKey | 'settings' | null>> = {
  home: 'home',
  habits: 'home',
  goals: 'home',
  stats: 'home',
  review: 'home',
  agenda: 'agenda',
  day: 'agenda',
  week: 'agenda',
  tasks: 'tasks',
  reminders: 'tasks',
  notes: 'notes',
  taby: 'taby',
  focus: null,
  break: null,
  settings: 'settings',
  help: 'settings',
  feedback: 'settings',
  instrumentation: 'settings',
  updates: 'settings',
  hardware: 'settings',
}

/** O destino que a barra marca para uma rota, `'settings'` para Ajustes, ou `null` quando nenhum. */
export const destinationFor = (route: NavKey): DestinationKey | 'settings' | null => PLACE[route]

export const isAgendaRoute = (key: NavKey) => key === 'agenda' || key === 'day' || key === 'week'

// Dia e Semana são a Agenda; a pausa é um modo do Foco.
export const sectionLabelKey = (route: NavKey): DictionaryKey =>
  route === 'home' ? 'redesign.nav.today' : isAgendaRoute(route) ? 'nav.agenda' : route === 'break' ? 'nav.focus' : `nav.${route}`

/** A trilha depois de "Meu espaço": o destino, quando a rota mora dentro dele, e a seção atual. */
export function breadcrumbFor(route: NavKey): DictionaryKey[] {
  const place = destinationFor(route)
  const section = sectionLabelKey(route)
  const parent = place === null ? null : place === 'settings' ? 'nav.settings' : DESTINATIONS.find((item) => item.key === place)?.label ?? null
  return parent && parent !== section ? [parent, section] : [section]
}

/**
 * Como a barra marca o lugar da rota (`aria-current`): `page` quando a rota é a própria página do destino (ou
 * de Ajustes), `true` quando é uma tela dentro dele. Em Hábitos, "Hoje" é a seção; a página é a da trilha.
 */
export const ariaCurrentFor = (route: NavKey): 'page' | 'true' => (breadcrumbFor(route).length === 1 ? 'page' : 'true')

export type FocusMoveKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End'

// Aritmética pura de foco em lista circular, usada pela barra (setas esquerda/direita) e pelo menu compacto
// (setas cima/baixo). `current` fora do intervalo (ex.: -1, quando o foco não está em nenhum item) começa do
// primeiro item ao avançar e do último ao retroceder, em vez de não fazer nada.
export function nextFocusIndex(current: number, count: number, key: FocusMoveKey): number {
  if (count <= 0) return -1
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  const forward = key === 'ArrowRight' || key === 'ArrowDown'
  if (current < 0 || current >= count) return forward ? 0 : count - 1
  return (current + (forward ? 1 : -1) + count) % count
}

import type { DictionaryKey } from '../../i18n/dictionary'

export type NavKey = 'home' | 'tasks' | 'agenda' | 'day' | 'week' | 'focus' | 'taby' | 'notes' | 'reminders' | 'habits' | 'goals' | 'review' | 'settings' | 'help' | 'feedback' | 'instrumentation' | 'updates' | 'hardware'

export type NavItem = Readonly<{ key: NavKey; label: DictionaryKey }>

export const DOCK_ITEMS: readonly NavItem[] = [
  { key: 'home', label: 'nav.home' },
  { key: 'tasks', label: 'nav.tasks' },
  { key: 'agenda', label: 'nav.agenda' },
  { key: 'focus', label: 'nav.focus' },
  { key: 'taby', label: 'nav.taby' },
]

export const MORE_ITEMS: readonly NavItem[] = [
  { key: 'reminders', label: 'nav.reminders' },
  { key: 'notes', label: 'nav.notes' },
  { key: 'habits', label: 'nav.habits' },
  { key: 'goals', label: 'nav.goals' },
  { key: 'review', label: 'nav.review' },
  { key: 'settings', label: 'nav.settings' },
  { key: 'help', label: 'nav.help' },
  { key: 'instrumentation', label: 'nav.instrumentation' },
  { key: 'feedback', label: 'nav.feedback' },
  { key: 'updates', label: 'nav.updates' },
  { key: 'hardware', label: 'nav.hardware' },
]

export const isAgendaRoute = (key: NavKey) => key === 'agenda' || key === 'day' || key === 'week'

// Dia e Semana são a mesma seção para o dock.
export const dockKeyFor = (route: NavKey): NavKey => isAgendaRoute(route) ? 'agenda' : route

export const sectionLabelKey = (route: NavKey): DictionaryKey => isAgendaRoute(route) ? 'nav.agenda' : `nav.${route}`

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

export type FocusMoveKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End'

// Aritmética pura de foco em lista circular, usada pelo dock (setas esquerda/direita) e pelo
// menu "···" (setas cima/baixo). `current` fora do intervalo (ex.: -1, quando o foco não está em
// nenhum item) começa do primeiro item ao avançar e do último ao retroceder, em vez de no-op.
export function nextFocusIndex(current: number, count: number, key: FocusMoveKey): number {
  if (count <= 0) return -1
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  const forward = key === 'ArrowRight' || key === 'ArrowDown'
  if (current < 0 || current >= count) return forward ? 0 : count - 1
  return (current + (forward ? 1 : -1) + count) % count
}

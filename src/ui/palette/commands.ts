import type { DictionaryKey } from '../../i18n/dictionary'
import type { NavKey } from '../shell/routes'

export type PaletteCommand = Readonly<{ key: string; label: DictionaryKey; group: 'palette.group.navigate' | 'palette.group.work' | 'palette.group.system'; route: NavKey }>

export const PALETTE_COMMANDS: readonly PaletteCommand[] = [
  { key: '/day', label: 'command.day', group: 'palette.group.navigate', route: 'day' },
  { key: '/week', label: 'command.week', group: 'palette.group.navigate', route: 'week' },
  { key: '/tasks', label: 'command.tasks', group: 'palette.group.navigate', route: 'tasks' },
  { key: '/reminders', label: 'command.reminders', group: 'palette.group.navigate', route: 'reminders' },
  { key: '/habits', label: 'command.habits', group: 'palette.group.navigate', route: 'habits' },
  { key: '/goals', label: 'command.goals', group: 'palette.group.navigate', route: 'goals' },
  { key: '/notes', label: 'command.notes', group: 'palette.group.navigate', route: 'notes' },
  { key: '/review', label: 'command.review', group: 'palette.group.navigate', route: 'review' },
  { key: '/stats', label: 'command.stats', group: 'palette.group.navigate', route: 'review' },
  { key: '/taby', label: 'command.taby', group: 'palette.group.navigate', route: 'taby' },
  { key: '/help', label: 'command.help', group: 'palette.group.system', route: 'help' },
  { key: '/feedback', label: 'command.feedback', group: 'palette.group.system', route: 'feedback' },
  { key: '/bug', label: 'command.bug', group: 'palette.group.system', route: 'feedback' },
  { key: '/idea', label: 'command.idea', group: 'palette.group.system', route: 'feedback' },
  { key: '/focus', label: 'command.focus', group: 'palette.group.work', route: 'focus' },
  { key: '/settings', label: 'command.settings', group: 'palette.group.system', route: 'settings' },
  { key: '/tools', label: 'command.tools', group: 'palette.group.system', route: 'settings' },
  { key: '/events', label: 'command.events', group: 'palette.group.system', route: 'instrumentation' },
  { key: '/updates', label: 'command.updates', group: 'palette.group.system', route: 'updates' },
  { key: '/hardware', label: 'command.hardware', group: 'palette.group.system', route: 'hardware' },
]

export const filterCommands = (query: string, t: (key: DictionaryKey) => string): readonly PaletteCommand[] => {
  const needle = query.trim().toLowerCase()
  return PALETTE_COMMANDS.filter((command) => `${command.key} ${t(command.label)}`.toLowerCase().includes(needle))
}

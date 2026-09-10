import { NO_FOLDER, planFolderRename, type FolderRenameRefusal, type FolderSummary } from '../../domain/folders'
import type { StudyData } from '../../domain/models'
import type { DictionaryKey } from '../../i18n/dictionary'

type Translate = (key: DictionaryKey) => string

// As vistas da paleta além da lista de comandos. Cada `esc` volta um passo:
// juntar → renomear → pastas → comandos; em comandos, `esc` fecha como antes.
export type PaletteView =
  | Readonly<{ kind: 'commands' }>
  | Readonly<{ kind: 'folders' }>
  | Readonly<{ kind: 'rename'; from: string; error: FolderRenameRefusal | null }>
  | Readonly<{ kind: 'merge'; from: string; to: string; tasks: number; notes: number }>

export const previousView = (view: PaletteView): PaletteView | null =>
  view.kind === 'merge' ? { kind: 'rename', from: view.from, error: null }
    : view.kind === 'rename' ? { kind: 'folders' }
      : view.kind === 'folders' ? { kind: 'commands' }
        : null

export const reasonKey: Record<FolderRenameRefusal, DictionaryKey> = {
  empty: 'folders.reason.empty',
  unchanged: 'folders.reason.unchanged',
  'too-long': 'folders.reason.too-long',
  'no-folder': 'folders.reason.no-folder',
  missing: 'folders.reason.missing',
}

export const folderLabel = (name: string, t: Translate) => name === NO_FOLDER ? t('folders.none') : name

export const countsLabel = (tasks: number, notes: number, t: Translate) => [
  tasks > 0 ? `${tasks} ${t(tasks === 1 ? 'folders.task' : 'folders.tasks')}` : '',
  notes > 0 ? `${notes} ${t(notes === 1 ? 'folders.note' : 'folders.notes')}` : '',
].filter(Boolean).join(' · ')

export const filterFolders = (folders: readonly FolderSummary[], query: string, t: Translate) => {
  const needle = query.trim().toLowerCase()
  return folders.filter((folder) => folderLabel(folder.name, t).toLowerCase().includes(needle))
}

export type FolderKey = Readonly<{ key: string; shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }>
export type FolderIntent =
  | Readonly<{ type: 'open'; route: 'tasks' | 'notes'; folder: string }>
  | Readonly<{ type: 'rename'; from: string }>
  | Readonly<{ type: 'none' }>

// ↵ abre Tarefas, ⇧↵ abre Notas, ⌘↵ (ou Ctrl+↵) renomeia. "Sem pasta" não é uma pasta de verdade.
export function folderIntent(event: FolderKey, selected: FolderSummary | undefined): FolderIntent {
  if (event.key !== 'Enter' || !selected) return { type: 'none' }
  if (event.metaKey || event.ctrlKey) return selected.name === NO_FOLDER ? { type: 'none' } : { type: 'rename', from: selected.name }
  return { type: 'open', route: event.shiftKey ? 'notes' : 'tasks', folder: selected.name }
}

export type RenameOutcome =
  | Readonly<{ type: 'apply'; from: string; to: string }>
  | Readonly<{ type: 'confirm-merge'; view: Extract<PaletteView, { kind: 'merge' }> }>
  | Readonly<{ type: 'refuse'; reason: FolderRenameRefusal }>

// Renomear para um nome livre aplica na hora — desfaz-se renomeando de volta. Juntar não se desfaz,
// então pede um segundo ↵ com a contagem do que vai mudar.
export function renameOutcome(data: Pick<StudyData, 'tasks' | 'notes'>, from: string, to: string): RenameOutcome {
  const plan = planFolderRename(data, from, to)
  if (!plan.ok) return { type: 'refuse', reason: plan.reason }
  if (plan.merge) return { type: 'confirm-merge', view: { kind: 'merge', from: plan.from, to: plan.to, tasks: plan.tasks, notes: plan.notes } }
  return { type: 'apply', from: plan.from, to: plan.to }
}

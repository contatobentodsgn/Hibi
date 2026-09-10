import type { Note, StudyData, Task } from './models'

// Pastas não são uma entidade: existem enquanto algum item as usa. `NO_FOLDER` agrupa os itens sem
// pasta; como todo nome real é não vazio depois de aparado, a chave vazia nunca colide com uma pasta.
export const NO_FOLDER = ''
export const FOLDER_NAME_MAX = 120

export type FolderSummary = Readonly<{ name: string; tasks: number; notes: number }>
export type FolderRenameRefusal = 'empty' | 'unchanged' | 'too-long' | 'no-folder' | 'missing'
export type FolderRenamePlan =
  | Readonly<{ ok: true; from: string; to: string; tasks: number; notes: number; merge: boolean }>
  | Readonly<{ ok: false; reason: FolderRenameRefusal }>

type FolderSource = Pick<StudyData, 'tasks' | 'notes'>

export const folderOf = (item: Pick<Task, 'folder'> | Pick<Note, 'folder'>): string => item.folder?.trim() ?? NO_FOLDER

export function listFolders(data: FolderSource): FolderSummary[] {
  const counts = new Map<string, { tasks: number; notes: number }>()
  const entry = (name: string) => {
    const current = counts.get(name) ?? { tasks: 0, notes: 0 }
    counts.set(name, current)
    return current
  }
  for (const task of data.tasks) entry(folderOf(task)).tasks += 1
  for (const note of data.notes) entry(folderOf(note)).notes += 1
  const named = [...counts]
    .filter(([name]) => name !== NO_FOLDER)
    .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    .map(([name, count]) => ({ name, ...count }))
  const none = counts.get(NO_FOLDER)
  return none ? [...named, { name: NO_FOLDER, ...none }] : named
}

// Calcula o efeito antes de aplicar, para a interface avisar sobre uma junção — que não se desfaz.
export function planFolderRename(data: FolderSource, from: string, to: string): FolderRenamePlan {
  if (from === NO_FOLDER) return { ok: false, reason: 'no-folder' }
  const target = to.trim()
  if (!target) return { ok: false, reason: 'empty' }
  if (target.length > FOLDER_NAME_MAX) return { ok: false, reason: 'too-long' }
  if (target === from) return { ok: false, reason: 'unchanged' }
  const folders = listFolders(data)
  const source = folders.find((folder) => folder.name === from)
  if (!source) return { ok: false, reason: 'missing' }
  return { ok: true, from, to: target, tasks: source.tasks, notes: source.notes, merge: folders.some((folder) => folder.name === target) }
}

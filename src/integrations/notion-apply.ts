import type { LocalRepository } from '../data/local-repository'
import type { Task } from '../domain/models'
import type { NotionTaskRecord } from './notion-sync'
export type NotionLocalMutation =
  | Readonly<{ type: 'pull-create'; remote: NotionTaskRecord }>
  | Readonly<{ type: 'pull-update'; localId: string; remote: NotionTaskRecord }>
  | Readonly<{ type: 'duplicate'; remote: NotionTaskRecord }>
  | Readonly<{ type: 'link'; localId: string; remoteId: string; revision: string }>

const fieldsFromRemote = (remote: NotionTaskRecord): Partial<Omit<Task, 'id'>> => ({
  title: remote.title,
  description: remote.description,
  durationMinutes: remote.durationMinutes ?? 60,
  status: remote.status ?? 'open',
  deadline: remote.deadline,
})

export function applyNotionMutations(repository: LocalRepository, mutations: readonly NotionLocalMutation[]): readonly Task[] {
  for (const mutation of mutations) {
    if (mutation.type === 'link') repository.updateTask(mutation.localId, { remoteRef: { connectorId: 'notion', remoteId: mutation.remoteId, revision: mutation.revision } })
    if (mutation.type === 'pull-update') repository.updateTask(mutation.localId, { ...fieldsFromRemote(mutation.remote), remoteRef: { connectorId: 'notion', remoteId: mutation.remote.remoteId, revision: mutation.remote.revision } })
    if (mutation.type === 'pull-create' || mutation.type === 'duplicate') repository.createTask({ ...fieldsFromRemote(mutation.remote), title: mutation.remote.title, durationMinutes: mutation.remote.durationMinutes ?? 60, category: 'work', folder: 'Bento', ...(mutation.type === 'pull-create' ? { remoteRef: { connectorId: 'notion', remoteId: mutation.remote.remoteId, revision: mutation.remote.revision } } : {}) })
  }
  return repository.listTasks()
}

import type { EntityStatus, Task } from '../domain/models'

export type NotionTaskRecord = Readonly<{
  remoteId: string
  revision: string
  hibiId?: string
  title: string
  status?: EntityStatus
  deadline?: string
  durationMinutes?: number
  description?: string
}>

export type NotionSyncCheckpoint = Readonly<{
  localId: string
  remoteId: string
  localHash: string
  remoteRevision: string
}>

export type NotionSyncState = 'local-new' | 'remote-new' | 'local-changed' | 'remote-changed' | 'unchanged' | 'conflict' | 'duplicate' | 'remote-missing'

export type NotionSyncPlanItem = Readonly<{
  key: string
  state: NotionSyncState
  localId?: string
  remoteId?: string
  local?: Task
  remote?: NotionTaskRecord
}>

export type NotionSyncPlan = Readonly<{
  items: readonly NotionSyncPlanItem[]
  summary: Readonly<{ push: number; pull: number; conflicts: number; unchanged: number }>
}>

type MappedTask = Pick<Task, 'title' | 'status' | 'deadline' | 'durationMinutes' | 'description'>

const mapped = (task: MappedTask) => ({
  title: task.title.trim(),
  status: task.status ?? 'open',
  deadline: task.deadline ?? null,
  durationMinutes: Number.isFinite(task.durationMinutes) ? Math.max(0, Math.round(task.durationMinutes)) : 0,
  description: task.description?.trim() ?? '',
})

const fnv1a = (value: string) => {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export const notionTaskHash = (task: MappedTask): string => fnv1a(JSON.stringify(mapped(task)))

export function buildNotionSyncPlan(localTasks: readonly Task[], remoteTasks: readonly NotionTaskRecord[], checkpoints: readonly NotionSyncCheckpoint[]): NotionSyncPlan {
  const items: NotionSyncPlanItem[] = []
  const localById = new Map(localTasks.map((task) => [task.id, task]))
  const localByRemote = new Map(localTasks.flatMap((task) => task.remoteRef?.connectorId === 'notion' ? [[task.remoteRef.remoteId, task] as const] : []))
  const checkpointByLocal = new Map(checkpoints.map((entry) => [entry.localId, entry]))
  const remotesByHibiId = new Map<string, NotionTaskRecord[]>()
  for (const remote of remoteTasks) {
    if (!remote.hibiId) continue
    const group = remotesByHibiId.get(remote.hibiId) ?? []
    group.push(remote)
    remotesByHibiId.set(remote.hibiId, group)
  }
  const duplicateRemoteIds = new Set([...remotesByHibiId.values()].filter((group) => group.length > 1).flatMap((group) => group.map((remote) => remote.remoteId)))
  const matchedLocalIds = new Set<string>()
  const matchedRemoteIds = new Set<string>()

  for (const remote of remoteTasks) {
    if (duplicateRemoteIds.has(remote.remoteId)) {
      const task = remote.hibiId ? localById.get(remote.hibiId) : undefined
      items.push({ key: `duplicate:${remote.remoteId}`, state: 'duplicate', remoteId: remote.remoteId, remote, ...(task ? { localId: task.id, local: task } : {}) })
      matchedRemoteIds.add(remote.remoteId)
      if (task) matchedLocalIds.add(task.id)
      continue
    }
    const task = localByRemote.get(remote.remoteId) ?? (remote.hibiId ? localById.get(remote.hibiId) : undefined)
    if (!task) continue
    matchedLocalIds.add(task.id)
    matchedRemoteIds.add(remote.remoteId)
    const base = checkpointByLocal.get(task.id)
    if (!base) {
      const equal = notionTaskHash(task) === notionTaskHash(remote)
      items.push({ key: `linked:${task.id}`, state: equal ? 'unchanged' : 'conflict', localId: task.id, remoteId: remote.remoteId, local: task, remote })
      continue
    }
    const localChanged = notionTaskHash(task) !== base.localHash
    const remoteChanged = remote.revision !== base.remoteRevision
    const state: NotionSyncState = localChanged && remoteChanged ? 'conflict' : localChanged ? 'local-changed' : remoteChanged ? 'remote-changed' : 'unchanged'
    items.push({ key: `linked:${task.id}`, state, localId: task.id, remoteId: remote.remoteId, local: task, remote })
  }

  for (const task of localTasks) {
    if (matchedLocalIds.has(task.id)) continue
    const missing = task.remoteRef?.connectorId === 'notion'
    items.push({ key: `local:${task.id}`, state: missing ? 'remote-missing' : 'local-new', localId: task.id, local: task, ...(missing ? { remoteId: task.remoteRef!.remoteId } : {}) })
  }
  for (const remote of remoteTasks) {
    if (matchedRemoteIds.has(remote.remoteId)) continue
    items.push({ key: `remote:${remote.remoteId}`, state: 'remote-new', remoteId: remote.remoteId, remote })
  }

  return {
    items,
    summary: {
      push: items.filter((item) => item.state === 'local-new' || item.state === 'local-changed').length,
      pull: items.filter((item) => item.state === 'remote-new' || item.state === 'remote-changed').length,
      conflicts: items.filter((item) => item.state === 'conflict' || item.state === 'duplicate' || item.state === 'remote-missing').length,
      unchanged: items.filter((item) => item.state === 'unchanged').length,
    },
  }
}

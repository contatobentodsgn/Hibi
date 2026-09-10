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

type MappedTask = Readonly<{ title: string; status?: EntityStatus; deadline?: string; durationMinutes?: number; description?: string }>

// Datas com hora viram o mesmo instante em ISO, para o hash não mudar só porque o Notion devolve
// o horário em outro formato. Datas sem hora ficam como estão, sem deslocar o dia por fuso.
const canonicalDeadline = (value?: string) => {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const instant = Date.parse(value)
  return Number.isNaN(instant) ? value : new Date(instant).toISOString()
}

const mapped = (task: MappedTask) => ({
  title: task.title.trim(),
  status: task.status ?? 'open',
  deadline: canonicalDeadline(task.deadline),
  durationMinutes: Number.isFinite(task.durationMinutes) ? Math.max(0, Math.round(task.durationMinutes!)) : 0,
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
    // O Notion arredonda `last_edited_time` para o minuto: uma edição no mesmo minuto da última
    // sincronização mantém a revisão. Comparar também o conteúdo com o que foi sincronizado impede
    // que essa edição passe por "só o local mudou" e seja sobrescrita em silêncio.
    const remoteChanged = remote.revision !== base.remoteRevision || notionTaskHash(remote) !== base.localHash
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

export type NotionDecision = 'keep-local' | 'keep-remote' | 'duplicate' | 'skip'

// A decisão sugerida para cada item. Um lado alterado sozinho segue esse lado; qualquer
// coisa ambígua — conflito de dois lados, duplicata, remoto sumido — cai em `skip`, que
// não escreve em lugar nenhum. O harness ao vivo verifica esta mesma função contra um
// conflito real, então a regra da interface e a validada no serviço são a mesma.
export const defaultDecisionFor = (item: NotionSyncPlanItem): NotionDecision =>
  item.state === 'local-new' || item.state === 'local-changed' ? 'keep-local'
    : item.state === 'remote-new' || item.state === 'remote-changed' ? 'keep-remote'
      : 'skip'

// A mesma conversão que a interface usa para transformar um candidato de importação
// no registro comparável. Exportada para o harness ao vivo poder validar contra o
// serviço real exatamente o mapeamento que o app aplica, sem uma segunda cópia.
export const notionRecordFromCandidate = (candidate: import('./imports').ImportCandidate): NotionTaskRecord | null =>
  candidate.kind === 'task' && candidate.revision
    ? {
      remoteId: candidate.remoteId,
      revision: candidate.revision,
      title: candidate.title,
      ...(candidate.hibiId ? { hibiId: candidate.hibiId } : {}),
      ...(candidate.status ? { status: candidate.status } : {}),
      ...(candidate.deadline ? { deadline: candidate.deadline } : {}),
      ...(candidate.durationMinutes === undefined ? {} : { durationMinutes: candidate.durationMinutes }),
      ...(candidate.description ? { description: candidate.description } : {}),
    }
    : null

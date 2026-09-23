import { describe, expect, it } from 'vitest'
import { buildNotionSyncPlan, notionTaskHash, staleNotionPlanKeys, type NotionSyncCheckpoint, type NotionTaskRecord } from '../notion-sync'
import type { Task } from '../../domain/models'

const local = (changes: Partial<Task> = {}): Task => ({
  id: 'task-1', title: 'Write brief', description: 'Context', durationMinutes: 60,
  category: 'work', status: 'open', deadline: '2026-09-10T09:00:00-03:00',
  updatedAt: '2026-09-09T12:00:00.000Z', ...changes,
})

const remote = (changes: Partial<NotionTaskRecord> = {}): NotionTaskRecord => ({
  remoteId: 'page-1', revision: '2026-09-09T12:00:00.000Z', pixanoId: 'task-1',
  title: 'Write brief', description: 'Context', durationMinutes: 60, status: 'open',
  deadline: '2026-09-10T09:00:00-03:00', ...changes,
})

const checkpoint = (task = local(), page = remote()): NotionSyncCheckpoint => ({
  localId: task.id, remoteId: page.remoteId, localHash: notionTaskHash(task), remoteRevision: page.revision,
})

describe('Notion task reconciliation', () => {
  it('produces stable hashes from mapped values only', () => {
    expect(notionTaskHash(local())).toBe(notionTaskHash(local({ folder: 'Another folder', remoteRef: { connectorId: 'notion', remoteId: 'x' } })))
    expect(notionTaskHash(local({ title: 'Changed' }))).not.toBe(notionTaskHash(local()))
  })

  it('classifies tasks that exist on only one side', () => {
    expect(buildNotionSyncPlan([local()], [], []).items).toEqual([expect.objectContaining({ state: 'local-new', localId: 'task-1' })])
    expect(buildNotionSyncPlan([], [remote()], []).items).toEqual([expect.objectContaining({ state: 'remote-new', remoteId: 'page-1' })])
  })

  it('detects unchanged and one-sided edits from the common checkpoint', () => {
    const base = checkpoint()
    expect(buildNotionSyncPlan([local()], [remote()], [base]).items[0].state).toBe('unchanged')
    expect(buildNotionSyncPlan([local({ title: 'Local edit' })], [remote()], [base]).items[0].state).toBe('local-changed')
    expect(buildNotionSyncPlan([local()], [remote({ title: 'Remote edit', revision: '2026-09-09T13:00:00.000Z' })], [base]).items[0].state).toBe('remote-changed')
  })

  it('surfaces simultaneous edits and duplicate remote Hibi IDs', () => {
    const base = checkpoint()
    expect(buildNotionSyncPlan(
      [local({ title: 'Local edit' })],
      [remote({ title: 'Remote edit', revision: '2026-09-09T13:00:00.000Z' })],
      [base],
    ).items[0].state).toBe('conflict')

    const duplicated = buildNotionSyncPlan([local()], [remote(), remote({ remoteId: 'page-2' })], [base])
    expect(duplicated.items.filter((item) => item.state === 'duplicate')).toHaveLength(2)
    expect(duplicated.summary.conflicts).toBe(2)
  })
})

describe('Notion revisions rounded to the minute', () => {
  it('detects a remote edit that kept the same minute-rounded revision', () => {
    const base = checkpoint()
    const sameMinute = remote({ title: 'Remote edit', revision: base.remoteRevision })
    expect(buildNotionSyncPlan([local()], [sameMinute], [base]).items[0].state).toBe('remote-changed')
    expect(buildNotionSyncPlan([local({ title: 'Local edit' })], [sameMinute], [base]).items[0].state).toBe('conflict')
  })

  it('treats the same instant written in another format as unchanged', () => {
    const base = checkpoint()
    expect(buildNotionSyncPlan([local()], [remote({ deadline: '2026-09-10T12:00:00.000Z' })], [base]).items[0].state).toBe('unchanged')
  })
})

describe('prévia velha', () => {
  const localChanged = () => buildNotionSyncPlan([local({ title: 'Write brief v2' })], [remote()], [checkpoint()])
  const remoteChanged = () => buildNotionSyncPlan([local()], [remote({ revision: 'r2', title: 'Remote v2' })], [checkpoint()])
  const keyOf = (plan: ReturnType<typeof buildNotionSyncPlan>) => plan.items[0]!.key

  it('nada mudou desde a prévia: nada é velho', () => {
    const plan = localChanged()
    expect(staleNotionPlanKeys(plan, { [keyOf(plan)]: 'keep-local' }, [local({ title: 'Write brief v2' })], [remote()])).toEqual([])
  })

  it('a tarefa local editada depois da prévia torna o item velho', () => {
    const plan = localChanged()
    expect(staleNotionPlanKeys(plan, { [keyOf(plan)]: 'keep-local' }, [local({ title: 'Write brief v3' })], [remote()])).toEqual([keyOf(plan)])
  })

  it('a tarefa local apagada depois da prévia torna o item velho', () => {
    const plan = localChanged()
    expect(staleNotionPlanKeys(plan, { [keyOf(plan)]: 'keep-local' }, [], [remote()])).toEqual([keyOf(plan)])
  })

  it('a página editada ou apagada no Notion depois da prévia torna o item velho', () => {
    const plan = remoteChanged()
    const decisions = { [keyOf(plan)]: 'keep-remote' }
    expect(staleNotionPlanKeys(plan, decisions, [local()], [remote({ revision: 'r3', title: 'Remote v3' })])).toEqual([keyOf(plan)])
    expect(staleNotionPlanKeys(plan, decisions, [local()], [])).toEqual([keyOf(plan)])
  })

  it('uma página criada no Notion para uma tarefa que a prévia via só daqui torna o item velho', () => {
    const plan = buildNotionSyncPlan([local()], [], [])
    expect(staleNotionPlanKeys(plan, { [keyOf(plan)]: 'keep-local' }, [local()], [remote()])).toEqual([keyOf(plan)])
  })

  it('um item que não será aplicado não bloqueia nada', () => {
    const plan = localChanged()
    expect(staleNotionPlanKeys(plan, { [keyOf(plan)]: 'skip' }, [], [])).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { buildNotionSyncPlan, notionTaskHash, type NotionSyncCheckpoint, type NotionTaskRecord } from '../notion-sync'
import type { Task } from '../../domain/models'

const local = (changes: Partial<Task> = {}): Task => ({
  id: 'task-1', title: 'Write brief', description: 'Context', durationMinutes: 60,
  category: 'work', status: 'open', deadline: '2026-09-10T09:00:00-03:00',
  updatedAt: '2026-09-09T12:00:00.000Z', ...changes,
})

const remote = (changes: Partial<NotionTaskRecord> = {}): NotionTaskRecord => ({
  remoteId: 'page-1', revision: '2026-09-09T12:00:00.000Z', hibiId: 'task-1',
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

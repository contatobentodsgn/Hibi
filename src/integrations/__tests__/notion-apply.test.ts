import { describe, expect, it } from 'vitest'
import { LocalRepository } from '../../data/local-repository'
import { applyNotionMutations } from '../notion-apply'

const empty = () => new LocalRepository({ tasks: [], reminders: [], notes: [], habits: [], goals: [], blocks: [], telemetry: [] }, () => '2026-09-10T02:00:00.000Z')

describe('applyNotionMutations', () => {
  it('creates and updates full mapped tasks and links successful pushes', () => {
    const repository = empty()
    const local = repository.createTask({ title: 'Local', durationMinutes: 60, category: 'work', status: 'open' })
    applyNotionMutations(repository, [
      { type: 'link', localId: local.id, remoteId: 'page-local', revision: 'v1' },
      { type: 'pull-create', remote: { remoteId: 'page-new', revision: 'v2', hibiId: 'remote-task', title: 'Remote', description: 'Context', durationMinutes: 45, status: 'paused', deadline: '2026-09-11T09:00:00-03:00' } },
    ])
    expect(repository.getTask(local.id)?.remoteRef).toEqual({ connectorId: 'notion', remoteId: 'page-local', revision: 'v1' })
    expect(repository.listTasks()).toContainEqual(expect.objectContaining({ title: 'Remote', description: 'Context', durationMinutes: 45, status: 'paused', deadline: '2026-09-11T09:00:00-03:00', remoteRef: { connectorId: 'notion', remoteId: 'page-new', revision: 'v2' } }))
  })

  it('creates an unlinked copy without claiming the same remote page', () => {
    const repository = empty()
    applyNotionMutations(repository, [{ type: 'duplicate', remote: { remoteId: 'page-1', revision: 'v1', title: 'Copy', durationMinutes: 30 } }])
    expect(repository.listTasks()[0]).toEqual(expect.objectContaining({ title: 'Copy', durationMinutes: 30 }))
    expect(repository.listTasks()[0].remoteRef).toBeUndefined()
  })
})

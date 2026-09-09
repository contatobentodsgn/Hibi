import { describe, expect, it } from 'vitest'
import { buildImportPreview, parseImportCandidates, resolveImportDecision } from '../imports'

describe('integration imports', () => {
  it('deduplicates by connector remote ID and surfaces a conflict for changed local data', () => {
    const preview = buildImportPreview(
      [{ id: 'task-1', title: 'Local title', remoteRef: { connectorId: 'notion', remoteId: 'page-1', revision: 'old' } }],
      [{ remoteId: 'page-1', revision: 'new', title: 'Remote title', kind: 'task' }, { remoteId: 'page-2', title: 'New task', kind: 'task' }],
      'notion',
    )

    expect(preview).toEqual([
      expect.objectContaining({ remoteId: 'page-1', state: 'conflict', localId: 'task-1' }),
      expect.objectContaining({ remoteId: 'page-2', state: 'new' }),
    ])
  })

  it('resolves keep-local, keep-remote, duplicate, and skip decisions without mutating input', () => {
    const candidate = { remoteId: 'page-1', revision: 'new', title: 'Remote title', kind: 'task' as const }

    expect(resolveImportDecision(candidate, 'keep-local')).toEqual({ operation: 'keep-local', candidate })
    expect(resolveImportDecision(candidate, 'keep-remote')).toEqual({ operation: 'keep-remote', candidate })
    expect(resolveImportDecision(candidate, 'duplicate')).toEqual({ operation: 'duplicate', candidate })
    expect(resolveImportDecision(candidate, 'skip')).toEqual({ operation: 'skip', candidate })
  })

  it('parses bounded CSV, JSON, and ICS task previews before applying any import', () => {
    expect(parseImportCandidates('tasks.csv', 'id,title\nrow-1,CSV task')).toEqual([{ remoteId: 'row-1', title: 'CSV task', kind: 'task' }])
    expect(parseImportCandidates('tasks.json', JSON.stringify([{ id: 'row-2', title: 'JSON task' }]))).toEqual([{ remoteId: 'row-2', title: 'JSON task', kind: 'task' }])
    expect(parseImportCandidates('calendar.ics', 'BEGIN:VEVENT\nUID:event-3\nSUMMARY:ICS task\nEND:VEVENT')).toEqual([{ remoteId: 'event-3', title: 'ICS task', kind: 'task' }])
  })
})

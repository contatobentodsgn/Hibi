import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { NotionSyncPanel, notionOperationsForPlan } from '../NotionSyncPanel'
import type { ConnectorSettings } from '../../integrations/contracts'
import { buildNotionSyncPlan } from '../../integrations/notion-sync'

const configured: ConnectorSettings = {
  endpoint: '', clientId: '', targets: [{ id: 'source-1', label: 'Hibi Tasks' }],
  notion: { workspaceLabel: "Kizuna Std's Notion", parentPageId: 'page-kizuna', databaseId: 'db-1', dataSourceId: 'source-1', lastSyncAt: '2026-09-10T01:00:00.000Z', lastSummary: { imported: 1, pushed: 2, updated: 1, skipped: 0, failed: 0, conflicts: 0 }, checkpoints: [] },
}

describe('NotionSyncPanel', () => {
  it('shows workspace, database, last sync, counts and sync control', () => {
    const markup = renderToStaticMarkup(<NotionSyncPanel connected settings={configured} localTasks={[]} onSaveSettings={async () => configured} onApply={() => []} onEvent={() => undefined} />)
    expect(markup).toContain("Kizuna Std&#x27;s Notion")
    expect(markup).toContain('Hibi Tasks')
    expect(markup).toContain('Last sync')
    expect(markup).toContain('1 imported')
    expect(markup).toContain('2 pushed')
    expect(markup).toContain('Sync now')
  })

  it('shows safe setup when the dedicated database is not configured', () => {
    const markup = renderToStaticMarkup(<NotionSyncPanel connected settings={{ endpoint: '', clientId: '', targets: [] }} localTasks={[]} onSaveSettings={async (patch) => ({ endpoint: '', clientId: '', targets: [], ...patch })} onApply={() => []} onEvent={() => undefined} />)
    expect(markup).toContain('Prepare Hibi Tasks')
    expect(markup).toContain('Kizuna')
    expect(markup).toContain('requires confirmation')
  })

  it('builds only selected remote writes and never writes conflicts by default', () => {
    const task = { id: 'task-1', title: 'Local', durationMinutes: 60, category: 'work' as const, status: 'open' as const }
    const conflict = buildNotionSyncPlan([task], [{ remoteId: 'page-1', revision: 'v2', hibiId: 'task-1', title: 'Remote', durationMinutes: 60 }], [])
    expect(notionOperationsForPlan(conflict, {}, 'source-1')).toEqual([])
    expect(notionOperationsForPlan(conflict, { [conflict.items[0].key]: 'keep-local' }, 'source-1')).toEqual([
      { key: conflict.items[0].key, kind: 'notion.page.update', payload: { id: 'page-1', task } },
    ])
  })
})

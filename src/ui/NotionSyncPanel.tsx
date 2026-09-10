import React, { useEffect, useMemo, useState } from 'react'
import type { Task } from '../domain/models'
import type { ConnectorSettings, IntegrationExecutionResult, NotionConnectorState } from '../integrations/contracts'
import { buildNotionSyncPlan, notionTaskHash, type NotionSyncPlan, type NotionSyncPlanItem, type NotionTaskRecord } from '../integrations/notion-sync'
import type { NotionLocalMutation } from '../integrations/notion-apply'

export type NotionDecision = 'keep-local' | 'keep-remote' | 'duplicate' | 'skip'
type Props = Readonly<{
  connected: boolean
  settings: ConnectorSettings
  localTasks: readonly Task[]
  onSaveSettings: (patch: Partial<ConnectorSettings>) => Promise<ConnectorSettings>
  onApply: (mutations: readonly NotionLocalMutation[]) => readonly Task[]
  onEvent: (action: string, detail: string, result?: string) => void
}>

type RemoteOperation = Readonly<{ key: string; kind: 'notion.page.create' | 'notion.page.update'; payload: Readonly<{ dataSourceId?: string; id?: string; task: Task }> }>
type Pending = Readonly<{ kind: 'setup' | 'sync'; actionId: string; confirmationId: string; plan?: NotionSyncPlan; decisions?: Readonly<Record<string, NotionDecision>> }>

const EMPTY_SUMMARY = { imported: 0, pushed: 0, updated: 0, skipped: 0, failed: 0, conflicts: 0 }
const KIZUNA_PAGE_ID = 'dd22241d14e14b298e6802525af7d2a7'
const defaultDecision = (item: NotionSyncPlanItem): NotionDecision => item.state === 'local-new' || item.state === 'local-changed' ? 'keep-local' : item.state === 'remote-new' || item.state === 'remote-changed' ? 'keep-remote' : 'skip'

export function notionOperationsForPlan(plan: NotionSyncPlan, decisions: Readonly<Record<string, NotionDecision>>, dataSourceId: string): readonly RemoteOperation[] {
  return plan.items.flatMap((item): readonly RemoteOperation[] => {
    if (decisions[item.key] !== 'keep-local' || !item.local) return []
    if (item.remoteId && item.state !== 'remote-missing') return [{ key: item.key, kind: 'notion.page.update', payload: { id: item.remoteId, task: item.local } }]
    return dataSourceId ? [{ key: item.key, kind: 'notion.page.create', payload: { dataSourceId, task: item.local } }] : []
  })
}

const remoteRecord = (candidate: import('../integrations/imports').ImportCandidate): NotionTaskRecord | null => candidate.kind === 'task' && candidate.revision
  ? { remoteId: candidate.remoteId, revision: candidate.revision, title: candidate.title, ...(candidate.hibiId ? { hibiId: candidate.hibiId } : {}), ...(candidate.status ? { status: candidate.status } : {}), ...(candidate.deadline ? { deadline: candidate.deadline } : {}), ...(candidate.durationMinutes === undefined ? {} : { durationMinutes: candidate.durationMinutes }), ...(candidate.description ? { description: candidate.description } : {}) }
  : null

const summaryText = (state: NotionConnectorState | undefined) => {
  const summary = state?.lastSummary ?? EMPTY_SUMMARY
  return `${summary.imported} imported · ${summary.pushed} pushed · ${summary.updated} updated · ${summary.failed} failed · ${summary.conflicts} conflicts`
}

export function NotionSyncPanel({ connected, settings, localTasks, onSaveSettings, onApply, onEvent }: Props) {
  const notion = settings.notion
  const [parentPageId, setParentPageId] = useState(notion?.parentPageId || KIZUNA_PAGE_ID)
  const [plan, setPlan] = useState<NotionSyncPlan | null>(null)
  const [decisions, setDecisions] = useState<Readonly<Record<string, NotionDecision>>>({})
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('Sync is manual. Nothing changes until you review it.')
  const [failedKeys, setFailedKeys] = useState<readonly string[]>([])

  const showConfirmation = (next: Pending, text: string) => {
    setPending(next)
    void window.hibiDesktop?.showNotch?.({ requestId: next.confirmationId, kind: 'confirmation', text, interaction: 'capture', actions: [{ id: 'confirm', label: 'Confirmar' }, { id: 'cancel', label: 'Cancelar' }] })
  }

  const prepareSetup = async () => {
    if (!connected || !parentPageId.trim()) return
    setBusy(true)
    try {
      const prepared = await window.hibiDesktop?.prepareIntegrationAction?.({ connectorId: 'notion', kind: 'notion.database.create', payload: { parentPageId: parentPageId.trim() } })
      if (!prepared) throw new Error('Setup is available in the desktop app.')
      showConfirmation({ kind: 'setup', actionId: prepared.id, confirmationId: prepared.confirmationId }, 'Criar a base Hibi Tasks dentro de Kizuna?')
      setNotice('Setup prepared. Confirm to create Hibi Tasks; no remote write has happened yet.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not prepare Hibi Tasks.') }
    finally { setBusy(false) }
  }

  const readSync = async () => {
    if (!notion?.dataSourceId) return
    setBusy(true); setFailedKeys([])
    try {
      const candidates = await window.hibiDesktop?.listIntegrationImportCandidates?.('notion')
      if (!candidates) throw new Error('Notion sync is available in the desktop app.')
      const remote = candidates.map(remoteRecord).filter((item): item is NotionTaskRecord => Boolean(item))
      const next = buildNotionSyncPlan(localTasks, remote, notion.checkpoints)
      setPlan(next)
      setDecisions(Object.fromEntries(next.items.map((item) => [item.key, defaultDecision(item)])))
      setNotice(`${next.items.length} items reviewed. Resolve conflicts, then review changes.`)
      onEvent('notion-sync-preview', `${next.items.length} items`, 'pass')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not read Hibi Tasks.'); onEvent('notion-sync-preview', 'read failed', 'fail') }
    finally { setBusy(false) }
  }

  const prepareSync = async () => {
    if (!plan || !notion?.dataSourceId) return
    const activePlan = failedKeys.length ? { ...plan, items: plan.items.filter((item) => failedKeys.includes(item.key)) } : plan
    const operations = notionOperationsForPlan(activePlan, decisions, notion.dataSourceId)
    const hasLocalChanges = activePlan.items.some((item) => ['keep-remote', 'duplicate'].includes(decisions[item.key] ?? 'skip'))
    if (!operations.length && !hasLocalChanges) { setNotice('No selected change needs confirmation.'); return }
    setBusy(true)
    try {
      if (operations.length) {
        const prepared = await window.hibiDesktop?.prepareIntegrationAction?.({ connectorId: 'notion', kind: 'notion.sync.batch', payload: { operations } })
        if (!prepared) throw new Error('Notion writes are available in the desktop app.')
        showConfirmation({ kind: 'sync', actionId: prepared.id, confirmationId: prepared.confirmationId, plan: activePlan, decisions }, `Aplicar ${operations.length} alterações no Notion e as alterações locais selecionadas?`)
      } else {
        const synthetic: Pending = { kind: 'sync', actionId: '', confirmationId: `notion-local-${crypto.randomUUID()}`, plan: activePlan, decisions }
        showConfirmation(synthetic, 'Aplicar as alterações selecionadas no Hibi?')
      }
      setNotice('Changes prepared. Confirm or cancel; nothing has been applied yet.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not prepare synchronization.') }
    finally { setBusy(false) }
  }

  const persistResult = async (currentPlan: NotionSyncPlan, currentDecisions: Readonly<Record<string, NotionDecision>>, execution: IntegrationExecutionResult) => {
    const resultByKey = new Map((execution.items ?? []).map((item) => [item.key, item]))
    const mutations: NotionLocalMutation[] = []
    const completedRemoteIds = new Set<string>()
    let imported = 0; let pushed = 0; let updated = 0; let skipped = 0
    for (const item of currentPlan.items) {
      const decision = currentDecisions[item.key] ?? 'skip'
      if (decision === 'keep-remote' && item.remote) {
        mutations.push(item.localId ? { type: 'pull-update', localId: item.localId, remote: item.remote } : { type: 'pull-create', remote: item.remote })
        completedRemoteIds.add(item.remote.remoteId); imported += item.localId ? 0 : 1; updated += item.localId ? 1 : 0
      } else if (decision === 'duplicate' && item.remote) { mutations.push({ type: 'duplicate', remote: item.remote }); imported += 1 }
      else if (decision === 'keep-local' && item.local) {
        const result = resultByKey.get(item.key)
        if (result?.ok && (result.remoteId || item.remoteId)) {
          const remoteId = result.remoteId ?? item.remoteId!
          const revision = result.revision ?? item.remote?.revision ?? item.local.remoteRef?.revision ?? ''
          mutations.push({ type: 'link', localId: item.local.id, remoteId, revision }); completedRemoteIds.add(remoteId); pushed += item.state === 'local-new' || item.state === 'remote-missing' ? 1 : 0; updated += item.state === 'local-changed' || item.state === 'conflict' ? 1 : 0
        }
      } else skipped += 1
    }
    const finalTasks = onApply(mutations)
    const oldByLocal = new Map((notion?.checkpoints ?? []).map((entry) => [entry.localId, entry]))
    const remoteRevision = new Map(currentPlan.items.flatMap((item) => item.remote ? [[item.remote.remoteId, item.remote.revision] as const] : []))
    for (const result of execution.items ?? []) if (result.ok && result.remoteId && result.revision) remoteRevision.set(result.remoteId, result.revision)
    const synchronized = finalTasks.filter((task) => task.remoteRef?.connectorId === 'notion' && completedRemoteIds.has(task.remoteRef.remoteId))
    for (const task of synchronized) oldByLocal.set(task.id, { localId: task.id, remoteId: task.remoteRef!.remoteId, localHash: notionTaskHash(task), remoteRevision: remoteRevision.get(task.remoteRef!.remoteId) ?? task.remoteRef!.revision ?? '' })
    const failures = (execution.items ?? []).filter((item) => !item.ok)
    const conflicts = currentPlan.items.filter((item) => ['conflict', 'duplicate', 'remote-missing'].includes(item.state) && (currentDecisions[item.key] ?? 'skip') === 'skip').length
    const lastSummary = { imported, pushed, updated, skipped, failed: failures.length, conflicts }
    await onSaveSettings({ targets: [{ id: notion!.dataSourceId, label: 'Hibi Tasks' }], notion: { ...notion!, lastSyncAt: new Date().toISOString(), lastSummary, checkpoints: [...oldByLocal.values()] } })
    setFailedKeys(failures.map((item) => item.key))
    setNotice(failures.length ? `${failures.length} change(s) failed. Retry will include only pending items.` : `Sync complete: ${summaryText({ ...notion!, lastSummary })}.`)
    onEvent('notion-sync-apply', `${mutations.length} local · ${execution.items?.length ?? 0} remote`, failures.length ? 'partial-failure' : 'pass')
  }

  const resolvePending = async (approved: boolean) => {
    const current = pending
    if (!current) return
    setPending(null); void window.hibiDesktop?.hideNotch?.(current.confirmationId)
    if (!approved) { setNotice('Synchronization cancelled. No selected change was applied.'); return }
    setBusy(true)
    try {
      const execution = current.actionId ? await window.hibiDesktop?.executeApprovedIntegrationAction?.({ actionId: current.actionId, confirmationId: current.confirmationId }) : { ok: true, items: [] }
      if (!execution) throw new Error('Confirmation could not be executed.')
      if (current.kind === 'setup') {
        if (!execution.ok || !execution.remoteId) throw new Error('Notion did not create Hibi Tasks.')
        const source = await window.hibiDesktop?.discoverNotionDataSource?.(execution.remoteId)
        if (!source) throw new Error('Could not discover the Hibi Tasks data source.')
        await onSaveSettings({ targets: [{ id: source.dataSourceId, label: 'Hibi Tasks' }], notion: { workspaceLabel: "Kizuna Std's Notion", parentPageId: parentPageId.trim(), databaseId: source.databaseId, dataSourceId: source.dataSourceId, lastSyncAt: '', lastSummary: EMPTY_SUMMARY, checkpoints: [] } })
        setNotice('Hibi Tasks is ready inside Kizuna.')
      } else if (current.plan && current.decisions) await persistResult(current.plan, current.decisions, execution)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Synchronization failed.'); onEvent('notion-sync-apply', 'execution failed', 'fail') }
    finally { setBusy(false) }
  }

  useEffect(() => window.hibiDesktop?.onCompanionAction?.((action) => { if (action.requestId === pending?.confirmationId) void resolvePending(action.actionId === 'confirm') }) ?? (() => undefined), [pending])
  const visibleItems = useMemo(() => plan?.items.filter((item) => item.state !== 'unchanged') ?? [], [plan])

  if (!notion?.dataSourceId) return <section className="notion-sync-panel" aria-label="Notion sync setup"><h4>Hibi Tasks</h4><p className="muted">Create the dedicated task database inside Kizuna. This remote write requires confirmation.</p><label>Workspace<input value="Kizuna Std's Notion" readOnly /></label><label>Kizuna parent page ID<input aria-label="Kizuna parent page ID" value={parentPageId} onChange={(event) => setParentPageId(event.target.value)} /></label><button className="primary" disabled={!connected || busy} onClick={() => void prepareSetup()}>Prepare Hibi Tasks</button>{pending && <Confirmation onResolve={resolvePending} />}{!connected && <p className="muted">Connect Notion first.</p>}<p className="muted" aria-live="polite">{notice}</p></section>

  return <section className="notion-sync-panel" aria-label="Notion task synchronization"><div className="notion-sync-heading"><div><h4>Hibi Tasks</h4><p className="muted">{notion.workspaceLabel || "Kizuna Std's Notion"} · manual two-way sync</p></div><button className="primary" disabled={!connected || busy} onClick={() => void readSync()}>{busy ? 'Working…' : 'Sync now'}</button></div><div className="notion-sync-meta"><span><b>Last sync</b> {notion.lastSyncAt ? new Date(notion.lastSyncAt).toLocaleString() : 'Never'}</span><span>{summaryText(notion)}</span></div>{visibleItems.length > 0 && <div className="notion-sync-preview" role="status"><h5>Review changes</h5>{visibleItems.map((item) => <div className="notion-sync-item" key={item.key}><div><strong>{item.local?.title ?? item.remote?.title ?? 'Untitled task'}</strong><span>{item.state.replace('-', ' ')}</span></div><select aria-label={`Sync decision for ${item.local?.title ?? item.remote?.title ?? item.key}`} value={decisions[item.key] ?? defaultDecision(item)} onChange={(event) => setDecisions((current) => ({ ...current, [item.key]: event.target.value as NotionDecision }))}><option value="keep-local">Keep Hibi</option><option value="keep-remote">Keep Notion</option><option value="duplicate">Create copy</option><option value="skip">Skip</option></select></div>)}<button className="primary" disabled={busy} onClick={() => void prepareSync()}>{failedKeys.length ? `Retry ${failedKeys.length} pending` : 'Review selected changes'}</button></div>}{plan && visibleItems.length === 0 && <p className="muted">Everything is up to date.</p>}{pending && <Confirmation onResolve={resolvePending} />}<p className="muted" aria-live="polite">{notice}</p></section>
}

function Confirmation({ onResolve }: { onResolve: (approved: boolean) => Promise<void> }) {
  return <div className="notion-confirmation" role="alert"><strong>Confirm synchronization</strong><p>No selected change has been applied yet.</p><div><button className="primary" onClick={() => void onResolve(true)}>Confirm</button><button className="outline" onClick={() => void onResolve(false)}>Cancel</button></div></div>
}

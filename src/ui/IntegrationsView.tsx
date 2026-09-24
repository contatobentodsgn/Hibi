import React, { useEffect, useRef, useState } from 'react'
import type { ConnectorSettings, IntegrationAuditEvent, IntegrationImportTarget, IntegrationStatus } from '../integrations/contracts'
import { buildImportPreview, type ImportCandidate, type ImportDecision, type ImportPreviewItem, type LocalImportRecord, parseImportCandidates } from '../integrations/imports'
import type { ScheduleBlock, Task } from '../domain/models'
import { NotionSyncPanel } from './NotionSyncPanel'
import { MacCalendarConnection } from './MacCalendarConnection'
import type { NotionLocalMutation } from '../integrations/notion-apply'

function OAuthClientSecretField({ label, saved, value, onChange, onSave, onClear }: { label: string; saved: boolean; value: string; onChange: (value: string) => void; onSave: () => void; onClear: () => void }) {
  return <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input aria-label={`${label} client secret`} type="password" autoComplete="new-password" placeholder="Client credential" value={value} onChange={(event) => onChange(event.target.value)} /><button className="outline" onClick={onSave}>Save client credential</button><span aria-live="polite">{saved ? 'Saved' : 'Not saved'}</span>{saved && <button className="outline" onClick={onClear}>Clear client credential</button>}</div>
}


type Props = Readonly<{ onEvent: (action: string, detail: string, result?: string) => void; localRecords?: readonly LocalImportRecord[]; localTasks?: readonly Task[]; localBlocks?: readonly ScheduleBlock[]; onApplyImport?: (candidate: ImportCandidate, decision: ImportDecision, localId?: string, connectorId?: string) => void; onApplyNotion?: (mutations: readonly NotionLocalMutation[]) => readonly Task[]; onMoveBlock?: (id: string, start: string, end: string) => boolean }>
const initial: readonly IntegrationStatus[] = [
  { id: 'notion', label: 'Notion', capabilities: ['import', 'write', 'sync'], state: 'disconnected', hasCredential: false },
  { id: 'slack', label: 'Slack', capabilities: ['import', 'write', 'sync'], state: 'disconnected', hasCredential: false },
  { id: 'email', label: 'Email', capabilities: ['import', 'write'], state: 'disconnected', hasCredential: false },
  { id: 'remote-notifications', label: 'Remote notifications', capabilities: ['notify', 'write'], state: 'disconnected', hasCredential: false },
  { id: 'google-calendar', label: 'Google Calendar', capabilities: ['import', 'write', 'sync'], state: 'disconnected', hasCredential: false },
]

const EMPTY_SETTINGS: ConnectorSettings = { endpoint: '', clientId: '', targets: [], authorizationUrl: '', tokenUrl: '' }
const auditTimestamp = (value: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) ? `${value.slice(0, 10)} ${value.slice(11, 16)}` : value

export function IntegrationsWorkspace({ onEvent, localRecords = [], localTasks = [], localBlocks = [], onApplyImport, onApplyNotion, onMoveBlock }: Props) {
  const [status, setStatus] = useState<readonly IntegrationStatus[]>(initial)
  const [audit, setAudit] = useState<readonly IntegrationAuditEvent[]>([])
  const [preview, setPreview] = useState<readonly ImportPreviewItem[]>([])
  // De onde veio a prévia atual: a decisão precisa gravar o mesmo conector para
  // que uma leitura seguinte reconheça o item como duplicata, e não como novo.
  const [previewSource, setPreviewSource] = useState('file-import')
  const [notice, setNotice] = useState('No credential is shown or stored in this view.')
  const [api, setApi] = useState<{ origin: string } | null>(null)
  const [webhook, setWebhook] = useState<{ origin?: string; hasSecret: boolean; running: boolean }>({ hasSecret: false, running: false })
  const [webhookSecret, setWebhookSecret] = useState('')
  const [connecting, setConnecting] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [settings, setSettings] = useState<Readonly<Record<string, ConnectorSettings>>>({})
  const [oauthConnectors, setOauthConnectors] = useState<readonly string[]>([])
  const [targets, setTargets] = useState<Readonly<Record<string, readonly IntegrationImportTarget[]>>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [credential, setCredential] = useState('')
  const [clientSecretDraft, setClientSecretDraft] = useState('')
  const [clientSecretState, setClientSecretState] = useState<Readonly<Record<string, boolean>>>({})
  const inputRef = useRef<HTMLInputElement>(null)
  const refresh = async () => {
    try {
      const [nextStatus, nextAudit] = await Promise.all([window.pixanoDesktop?.listIntegrationStatus?.(), window.pixanoDesktop?.listIntegrationAudit?.()])
      if (nextStatus) setStatus(nextStatus)
      if (nextAudit) setAudit(nextAudit)
      setNotice('Integration status refreshed.')
      onEvent('integrations-refresh', 'Integration status', 'pass')
    } catch { setNotice('Could not refresh integration status.'); onEvent('integrations-refresh', 'Integration status', 'fail') }
  }
  useEffect(() => { void refresh() }, [])
  useEffect(() => { void window.pixanoDesktop?.getConnectorSettings?.('notion').then((value) => { if (value) setSettings((current) => ({ ...current, notion: value })) }).catch(() => undefined) }, [])
  useEffect(() => { void window.pixanoDesktop?.getWebhookStatus?.().then((value) => { if (value) setWebhook(value) }).catch(() => undefined) }, [])
  const revoke = async (connectorId: string) => {
    try { const next = await window.pixanoDesktop?.revokeIntegration?.(connectorId); if (next) setStatus((current) => current.map((entry) => entry.id === next.id ? next : entry)); setNotice('Integration credential revoked from Keychain.'); onEvent('integration-revoke', connectorId, 'pass') }
    catch { setNotice('Could not revoke this integration.'); onEvent('integration-revoke', connectorId, 'fail') }
  }
  const connect = async (connectorId: string) => {
    if (!credential.trim()) { setNotice('Paste an access token supplied by the service first.'); return }
    try {
      const next = await window.pixanoDesktop?.connectIntegration?.(connectorId, credential)
      setCredential(''); setConnecting(null)
      if (next) setStatus((current) => current.map((entry) => entry.id === next.id ? next : entry))
      setNotice('Access token saved in Keychain. It will not be shown again.')
      onEvent('integration-connect', connectorId, 'pass')
    } catch { setNotice('Could not save this access token.'); onEvent('integration-connect', connectorId, 'fail') }
  }
  const importFile = async (file: File) => {
    try { const candidates = parseImportCandidates(file.name, await file.text()); setPreviewSource('file-import'); setPreview(buildImportPreview(localRecords, candidates, 'file-import')); setNotice(`${candidates.length} items are ready for review; nothing has been imported yet.`); onEvent('integration-import-preview', file.name, 'pass') }
    catch (error) { setPreview([]); setNotice(error instanceof Error ? error.message : 'Could not preview this import.'); onEvent('integration-import-preview', file.name, 'fail') }
  }
  const applyImport = (item: ImportPreviewItem, decision: ImportDecision) => {
    onApplyImport?.(item, decision, item.localId, previewSource)
    setPreview((current) => current.filter((entry) => entry.remoteId !== item.remoteId))
    setNotice(decision === 'skip' || decision === 'keep-local' ? 'Import decision recorded without changing the local task.' : 'Import decision applied to the local workspace.')
    onEvent('integration-import-apply', `${decision}: ${item.title}`, 'pass')
  }
  const toggleApi = async () => {
    try {
      if (api) { await window.pixanoDesktop?.stopLocalApi?.(); setApi(null); setNotice('Local API stopped.'); return }
      const started = await window.pixanoDesktop?.startLocalApi?.();
      if (!started) { setNotice('Local API is available in the desktop app.'); return }
      setApi({ origin: started.origin }); setNotice('Local API started. Its bearer token remains in Keychain and is never shown here.'); onEvent('local-api-start', started.origin, 'pass')
    } catch { setNotice('Could not change the Local API state.'); onEvent('local-api', 'toggle', 'fail') }
  }
  useEffect(() => {
    void Promise.all(initial.map(async (connector) => [connector.id, await window.pixanoDesktop?.isOauthSupported?.(connector.id) === true] as const))
      .then((entries) => setOauthConnectors(entries.filter(([, supported]) => supported).map(([id]) => id)))
      .catch(() => undefined)
  }, [])
  const settingsFor = (connectorId: string) => settings[connectorId] ?? EMPTY_SETTINGS
  // Trocar o endpoint ou as URLs de autorização muda quem suporta OAuth, e quem
  // responde isso é o processo principal: a resposta é perguntada de novo depois
  // de salvar, em vez de adivinhada aqui.
  const refreshOauthSupport = async (connectorId: string) => {
    const supported = await window.pixanoDesktop?.isOauthSupported?.(connectorId) === true
    setOauthConnectors((current) => supported ? current.includes(connectorId) ? current : [...current, connectorId] : current.filter((entry) => entry !== connectorId))
  }
  const saveConnection = (connectorId: string, patch: Partial<ConnectorSettings>) => { void saveSettings(connectorId, patch).then(() => refreshOauthSupport(connectorId)).catch(() => undefined) }
  const openSettings = async (connectorId: string) => {
    setExpanded((current) => current === connectorId ? null : connectorId)
    try {
      const value = await window.pixanoDesktop?.getConnectorSettings?.(connectorId)
      if (value) setSettings((current) => ({ ...current, [connectorId]: value }))
      if (oauthConnectors.includes(connectorId)) {
        const hasSecret = await window.pixanoDesktop?.hasOauthClientSecret?.(connectorId)
        if (typeof hasSecret === 'boolean') setClientSecretState((current) => ({ ...current, [connectorId]: hasSecret }))
        setClientSecretDraft('')
      }
    } catch { setNotice('Could not read this connector configuration.') }
  }
  const saveSettings = async (connectorId: string, patch: Partial<ConnectorSettings>): Promise<ConnectorSettings> => {
    try {
      const value = await window.pixanoDesktop?.saveConnectorSettings?.(connectorId, patch)
      if (value) { setSettings((current) => ({ ...current, [connectorId]: value })); setNotice('Connector configuration saved on this Mac.'); onEvent('connector-settings', connectorId, 'pass'); return value }
      setNotice('Connector configuration saved on this Mac.'); onEvent('connector-settings', connectorId, 'pass')
      throw new Error('Connector settings are available in the desktop app.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not save this connector configuration.'); onEvent('connector-settings', connectorId, 'fail'); throw error }
  }
  const authorize = async (connectorId: string) => {
    if (!settingsFor(connectorId).clientId) { setNotice('Add the client identifier supplied by the service before authorizing.'); return }
    setBusy(connectorId)
    try {
      const result = await window.pixanoDesktop?.authorizeIntegration?.(connectorId)
      // A atualização de status vem antes: refresh() também escreve no aviso.
      if (result) { await refresh(); setNotice(`Authorized. Tokens stay in Keychain${result.hasRefreshToken ? ' and can be refreshed' : ''}.`) }
      onEvent('integration-authorize', connectorId, 'pass')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'The authorization did not complete.'); onEvent('integration-authorize', connectorId, 'fail') }
    finally { setBusy(null) }
  }
  const saveClientSecret = async (connectorId: string) => {
    if (!clientSecretDraft.trim()) { setNotice('Paste the client credential first.'); return }
    try {
      const result = await window.pixanoDesktop?.saveOauthClientSecret?.(connectorId, clientSecretDraft)
      setClientSecretDraft('')
      if (result) setClientSecretState((current) => ({ ...current, [connectorId]: result.hasClientSecret }))
      setNotice('Client credential saved securely. Its value is never shown.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not save the client credential.') }
  }
  const clearClientSecret = async (connectorId: string) => {
    try {
      const result = await window.pixanoDesktop?.clearOauthClientSecret?.(connectorId)
      setClientSecretDraft('')
      if (result) setClientSecretState((current) => ({ ...current, [connectorId]: result.hasClientSecret }))
      setNotice('Client credential cleared securely.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not clear the client credential.') }
  }
  const testConnection = async (connectorId: string) => {
    setBusy(connectorId)
    try { const result = await window.pixanoDesktop?.testIntegrationConnection?.(connectorId); setNotice(result ? `${result.ok ? 'Connection test passed' : 'Connection test failed'}: ${result.detail}` : 'Connection tests are available in the desktop app.'); onEvent('integration-test', connectorId, result?.ok ? 'pass' : 'fail') }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not test this connection.'); onEvent('integration-test', connectorId, 'fail') }
    finally { setBusy(null) }
  }
  const loadTargets = async (connectorId: string) => {
    setBusy(connectorId)
    try { const value = await window.pixanoDesktop?.listIntegrationImportTargets?.(connectorId); setTargets((current) => ({ ...current, [connectorId]: value ?? [] })); setNotice(value?.length ? `${value.length} import targets available.` : 'No import target was returned.') }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not list import targets.') }
    finally { setBusy(null) }
  }
  const importFromConnector = async (connectorId: string) => {
    setBusy(connectorId)
    try {
      const candidates = await window.pixanoDesktop?.listIntegrationImportCandidates?.(connectorId)
      if (!candidates) { setNotice('Connector imports are available in the desktop app.'); return }
      // Leitura apenas: a prévia é a mesma da importação por arquivo e nada entra
      // no workspace antes de uma decisão por item.
      setPreviewSource(connectorId); setPreview(buildImportPreview(localRecords, candidates, connectorId))
      setNotice(candidates.length ? `${candidates.length} items read from ${connectorId}; nothing has been imported yet.` : `No item was returned by ${connectorId}.`)
      onEvent('integration-import-read', connectorId, 'pass')
    } catch (error) { setPreview([]); setNotice(error instanceof Error ? error.message : 'Could not read from this connector.'); onEvent('integration-import-read', connectorId, 'fail') }
    finally { setBusy(null) }
  }
  const toggleTarget = (connectorId: string, target: IntegrationImportTarget) => {
    const current = settingsFor(connectorId).targets
    const next = current.some((entry) => entry.id === target.id) ? current.filter((entry) => entry.id !== target.id) : [...current, target]
    void saveSettings(connectorId, { targets: next })
  }
  const configureWebhook = async () => {
    if (!webhookSecret.trim()) { setNotice('Paste a webhook signing secret first.'); return }
    try { const value = await window.pixanoDesktop?.configureWebhook?.(webhookSecret); setWebhookSecret(''); if (value) setWebhook(value); setNotice('Webhook secret saved in Keychain.'); onEvent('webhook-configure', 'Local webhook', 'pass') } catch { setNotice('Could not configure the local webhook.'); }
  }
  const toggleWebhook = async () => {
    try { const value = webhook.running ? await window.pixanoDesktop?.stopWebhook?.() : await window.pixanoDesktop?.startWebhook?.(); if (value) { setWebhook(value); setNotice(value.running ? `Webhook listening at ${value.origin}.` : 'Local webhook stopped.'); } } catch { setNotice('Could not change webhook state.'); }
  }
  const notionStatus = status.find((connector) => connector.id === 'notion')
  return <section className="settings-card" aria-label="Integrations"><div className="view-heading"><div><p className="eyebrow">CONNECTED SERVICES</p><h2>Integrations</h2><p className="muted">Connections stay optional. Remote writes always require a separate approval.</p></div><button className="outline" onClick={() => void refresh()}>Refresh status</button></div><MacCalendarConnection onEvent={onEvent} blocks={localBlocks} onMoveBlock={onMoveBlock} />{notionStatus && <NotionSyncPanel connected={notionStatus.state === 'connected'} settings={settingsFor('notion')} localTasks={localTasks} onSaveSettings={(patch) => saveSettings('notion', patch)} onApply={(mutations) => onApplyNotion?.(mutations) ?? []} onEvent={onEvent} />}{status.map((connector) => <div className="connector-block" data-connector={connector.id} aria-label={`${connector.label} connector`} key={connector.id}><div className="setting-row"><div><strong>{connector.label}</strong><span>{connector.capabilities.join(' · ')} · {connector.state}</span></div><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{connector.state === 'connected' && <button className="outline" disabled={busy === connector.id} onClick={() => void testConnection(connector.id)}>Test connection</button>}<button className="outline" aria-expanded={expanded === connector.id} onClick={() => void openSettings(connector.id)}>Configure</button>{connector.state === 'connected' ? <button className="outline" onClick={() => void revoke(connector.id)}>Revoke</button> : connecting === connector.id ? <><input aria-label={`${connector.label} access token`} type="password" autoComplete="off" value={credential} placeholder="Access token" onChange={(event) => setCredential(event.target.value)} /><button className="primary" onClick={() => void connect(connector.id)}>Save access token</button></> : <>{oauthConnectors.includes(connector.id) && <button className="primary" disabled={busy === connector.id} onClick={() => void authorize(connector.id)}>{busy === connector.id ? 'Waiting for the browser…' : 'Authorize'}</button>}<button className="outline" onClick={() => { setCredential(''); setConnecting(connector.id) }}>Connect securely</button></>}</div></div>{expanded === connector.id && <div className="connector-settings" aria-label={`${connector.label} configuration`}><div className="setting-row"><div><strong>Endpoint</strong><span>HTTPS base URL used by this connector. Leave empty to keep the built-in service.</span></div><div style={{ display: 'flex', gap: 8 }}><input aria-label={`${connector.label} endpoint`} type="url" inputMode="url" autoComplete="off" placeholder="https://service.example.com/api" defaultValue={settingsFor(connector.id).endpoint} onBlur={(event) => { if (event.target.value.trim() !== settingsFor(connector.id).endpoint) saveConnection(connector.id, { endpoint: event.target.value.trim() }) }} /></div></div><div className="setting-row"><div><strong>Authorization server</strong><span>Authorization and token URLs of the service behind this endpoint. Both are needed for OAuth; leave empty to keep the built-in service or to use a direct credential.</span></div><div style={{ display: 'flex', gap: 8 }}><input aria-label={`${connector.label} authorization URL`} type="url" inputMode="url" autoComplete="off" placeholder="https://service.example.com/oauth/authorize" defaultValue={settingsFor(connector.id).authorizationUrl ?? ''} onBlur={(event) => { if (event.target.value.trim() !== (settingsFor(connector.id).authorizationUrl ?? '')) saveConnection(connector.id, { authorizationUrl: event.target.value.trim() }) }} /><input aria-label={`${connector.label} token URL`} type="url" inputMode="url" autoComplete="off" placeholder="https://service.example.com/oauth/token" defaultValue={settingsFor(connector.id).tokenUrl ?? ''} onBlur={(event) => { if (event.target.value.trim() !== (settingsFor(connector.id).tokenUrl ?? '')) saveConnection(connector.id, { tokenUrl: event.target.value.trim() }) }} /></div></div>{oauthConnectors.includes(connector.id) && <div className="setting-row"><div><strong>Client identifier</strong><span>Public PKCE client id from the service. No client secret is stored.</span></div><div style={{ display: 'flex', gap: 8 }}><input aria-label={`${connector.label} client identifier`} autoComplete="off" placeholder="client-id" defaultValue={settingsFor(connector.id).clientId} onBlur={(event) => { if (event.target.value.trim() !== settingsFor(connector.id).clientId) void saveSettings(connector.id, { clientId: event.target.value.trim() }) }} />{connector.state === 'connected' && <button className="outline" disabled={busy === connector.id} onClick={() => void window.pixanoDesktop?.refreshIntegrationAuthorization?.(connector.id).then(() => setNotice('Authorization refreshed.')).catch((error: unknown) => setNotice(error instanceof Error ? error.message : 'Could not refresh this authorization.'))}>Refresh token</button>}</div></div>}{oauthConnectors.includes(connector.id) && <div className="setting-row"><div><strong>Client credential</strong><span>Stored securely in Keychain. The value is never read back or displayed.</span></div><OAuthClientSecretField label={connector.label} saved={clientSecretState[connector.id] === true} value={clientSecretDraft} onChange={setClientSecretDraft} onSave={() => void saveClientSecret(connector.id)} onClear={() => void clearClientSecret(connector.id)} /></div>}{!oauthConnectors.includes(connector.id) && <p className="muted">This connector uses a direct credential. OAuth is not available for this endpoint until its authorization and token URLs are configured above.</p>}{connector.capabilities.includes('import') && <div className="setting-row"><div><strong>Imported sources</strong><span>{settingsFor(connector.id).targets.length ? `${settingsFor(connector.id).targets.length} selected · only these are imported` : 'Nothing selected yet; imports stay empty until you choose a source.'}</span></div><div style={{ display: 'flex', gap: 8 }}><button className="outline" disabled={busy === connector.id || connector.state !== 'connected'} onClick={() => void loadTargets(connector.id)}>Load available sources</button><button className="outline" disabled={busy === connector.id || connector.state !== 'connected' || settingsFor(connector.id).targets.length === 0} onClick={() => void importFromConnector(connector.id)}>Read for import</button></div></div>}{(targets[connector.id] ?? []).length > 0 && <ul className="target-list" aria-label={`${connector.label} import sources`}>{(targets[connector.id] ?? []).map((target) => <li key={target.id}><label><input type="checkbox" checked={settingsFor(connector.id).targets.some((entry) => entry.id === target.id)} onChange={() => toggleTarget(connector.id, target)} />{target.label}</label></li>)}</ul>}</div>}</div>)}<div className="settings-divider" /><div className="setting-row"><div><strong>Import preview</strong><span>Preview CSV, JSON, or ICS before choosing a conflict decision.</span></div><button className="outline" onClick={() => inputRef.current?.click()}>Choose file</button><input ref={inputRef} type="file" accept=".csv,.json,.ics,text/calendar,application/json,text/csv" style={{ display: 'none' }} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importFile(file) }} /></div>{preview.length > 0 && <div role="status">{preview.map((item) => <div className="setting-row" key={item.remoteId}><div><strong>{item.title}</strong><span>{item.state}{item.localId ? ' · linked local task' : ''}</span></div><div style={{ display: 'flex', gap: 8 }}><select aria-label={`Import decision for ${item.title}`} defaultValue={item.state === 'conflict' ? 'keep-local' : item.state === 'duplicate' ? 'skip' : 'duplicate'}><option value="keep-local">Keep local</option><option value="keep-remote">Use imported</option><option value="duplicate">Create copy</option><option value="skip">Skip</option></select><button className="outline" onClick={(event) => applyImport(item, (event.currentTarget.previousElementSibling as HTMLSelectElement).value as ImportDecision)}>Apply</button></div></div>)}</div>}<div className="setting-row"><div><strong>Local API</strong><span>Loopback-only API with a revocable Keychain bearer token. Writes return confirmation intents.</span></div><button className="outline" onClick={() => void toggleApi()}>{api ? 'Stop local API' : 'Start local API'}</button></div>{api && <p className="muted" role="status">{api.origin} · Running locally; the token is retained only in Keychain.</p>}<div className="setting-row"><div><strong>Local webhook</strong><span>Signed inbound events are verified on this Mac and accepted. Nothing in your workspace changes.</span></div>{webhook.hasSecret ? <button className="outline" onClick={() => void toggleWebhook()}>{webhook.running ? 'Stop webhook' : 'Start webhook'}</button> : <div style={{ display: 'flex', gap: 8 }}><input aria-label="Webhook signing secret" type="password" autoComplete="off" value={webhookSecret} onChange={(event) => setWebhookSecret(event.target.value)} placeholder="Signing secret" /><button className="primary" onClick={() => void configureWebhook()}>Save secret</button></div>}</div>{webhook.running && webhook.origin && <p className="muted" role="status">{webhook.origin}/webhook · Loopback only</p>}<div className="setting-row"><div><strong>Audit</strong><span>{audit.length ? `${audit.length} safe local audit entries` : 'No remote action has been recorded.'}</span></div><button className="outline" onClick={() => void refresh()}>Refresh audit</button></div>{audit.length > 0 && <ul className="audit-history" aria-label="Integration audit history">{audit.map((entry, index) => <li className="event-row" key={`${entry.at}-${entry.action}-${index}`}><span className="event-time">{auditTimestamp(entry.at)}</span><span className="event-route">{entry.connectorId}</span><span>{entry.action}</span><span className="event-detail">{entry.detail}</span></li>)}</ul>}<p className="muted" aria-live="polite">{notice}</p><p className="muted">Saved credentials are never shown again in this view.</p></section>
}

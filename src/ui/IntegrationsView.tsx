import React, { useEffect, useRef, useState } from 'react'
import type { IntegrationAuditEvent, IntegrationStatus } from '../integrations/contracts'
import { buildImportPreview, type ImportCandidate, type ImportDecision, type ImportPreviewItem, type LocalImportRecord, parseImportCandidates } from '../integrations/imports'

type Props = Readonly<{ onEvent: (action: string, detail: string, result?: string) => void; localRecords?: readonly LocalImportRecord[]; onApplyImport?: (candidate: ImportCandidate, decision: ImportDecision, localId?: string) => void }>
const initial: readonly IntegrationStatus[] = [
  { id: 'notion', label: 'Notion', capabilities: ['import', 'write', 'sync'], state: 'disconnected', hasCredential: false },
  { id: 'slack', label: 'Slack', capabilities: ['import', 'write', 'sync'], state: 'disconnected', hasCredential: false },
  { id: 'email', label: 'Email', capabilities: ['import', 'write'], state: 'disconnected', hasCredential: false },
  { id: 'remote-notifications', label: 'Remote notifications', capabilities: ['notify', 'write'], state: 'disconnected', hasCredential: false },
]

export function IntegrationsView({ onEvent, localRecords = [], onApplyImport }: Props) {
  const [status, setStatus] = useState<readonly IntegrationStatus[]>(initial)
  const [audit, setAudit] = useState<readonly IntegrationAuditEvent[]>([])
  const [preview, setPreview] = useState<readonly ImportPreviewItem[]>([])
  const [notice, setNotice] = useState('No credential is shown or stored in this view.')
  const [api, setApi] = useState<{ origin: string } | null>(null)
  const [webhook, setWebhook] = useState<{ origin?: string; hasSecret: boolean; running: boolean }>({ hasSecret: false, running: false })
  const [webhookSecret, setWebhookSecret] = useState('')
  const [connecting, setConnecting] = useState<string | null>(null)
  const [credential, setCredential] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const refresh = async () => {
    try {
      const [nextStatus, nextAudit] = await Promise.all([window.hibiDesktop?.listIntegrationStatus?.(), window.hibiDesktop?.listIntegrationAudit?.()])
      if (nextStatus) setStatus(nextStatus)
      if (nextAudit) setAudit(nextAudit)
      setNotice('Integration status refreshed.')
      onEvent('integrations-refresh', 'Integration status', 'pass')
    } catch { setNotice('Could not refresh integration status.'); onEvent('integrations-refresh', 'Integration status', 'fail') }
  }
  useEffect(() => { void refresh() }, [])
  useEffect(() => { void window.hibiDesktop?.getWebhookStatus?.().then((value) => { if (value) setWebhook(value) }).catch(() => undefined) }, [])
  const revoke = async (connectorId: string) => {
    try { const next = await window.hibiDesktop?.revokeIntegration?.(connectorId); if (next) setStatus((current) => current.map((entry) => entry.id === next.id ? next : entry)); setNotice('Integration credential revoked from Keychain.'); onEvent('integration-revoke', connectorId, 'pass') }
    catch { setNotice('Could not revoke this integration.'); onEvent('integration-revoke', connectorId, 'fail') }
  }
  const connect = async (connectorId: string) => {
    if (!credential.trim()) { setNotice('Paste an access token supplied by the service first.'); return }
    try {
      const next = await window.hibiDesktop?.connectIntegration?.(connectorId, credential)
      setCredential(''); setConnecting(null)
      if (next) setStatus((current) => current.map((entry) => entry.id === next.id ? next : entry))
      setNotice('Access token saved in Keychain. It will not be shown again.')
      onEvent('integration-connect', connectorId, 'pass')
    } catch { setNotice('Could not save this access token.'); onEvent('integration-connect', connectorId, 'fail') }
  }
  const importFile = async (file: File) => {
    try { const candidates = parseImportCandidates(file.name, await file.text()); setPreview(buildImportPreview(localRecords, candidates, 'file-import')); setNotice(`${candidates.length} items are ready for review; nothing has been imported yet.`); onEvent('integration-import-preview', file.name, 'pass') }
    catch (error) { setPreview([]); setNotice(error instanceof Error ? error.message : 'Could not preview this import.'); onEvent('integration-import-preview', file.name, 'fail') }
  }
  const applyImport = (item: ImportPreviewItem, decision: ImportDecision) => {
    onApplyImport?.(item, decision, item.localId)
    setPreview((current) => current.filter((entry) => entry.remoteId !== item.remoteId))
    setNotice(decision === 'skip' || decision === 'keep-local' ? 'Import decision recorded without changing the local task.' : 'Import decision applied to the local workspace.')
    onEvent('integration-import-apply', `${decision}: ${item.title}`, 'pass')
  }
  const toggleApi = async () => {
    try {
      if (api) { await window.hibiDesktop?.stopLocalApi?.(); setApi(null); setNotice('Local API stopped.'); return }
      const started = await window.hibiDesktop?.startLocalApi?.();
      if (!started) { setNotice('Local API is available in the desktop app.'); return }
      setApi({ origin: started.origin }); setNotice('Local API started. Its bearer token remains in Keychain and is never shown here.'); onEvent('local-api-start', started.origin, 'pass')
    } catch { setNotice('Could not change the Local API state.'); onEvent('local-api', 'toggle', 'fail') }
  }
  const configureWebhook = async () => {
    if (!webhookSecret.trim()) { setNotice('Paste a webhook signing secret first.'); return }
    try { const value = await window.hibiDesktop?.configureWebhook?.(webhookSecret); setWebhookSecret(''); if (value) setWebhook(value); setNotice('Webhook secret saved in Keychain.'); onEvent('webhook-configure', 'Local webhook', 'pass') } catch { setNotice('Could not configure the local webhook.'); }
  }
  const toggleWebhook = async () => {
    try { const value = webhook.running ? await window.hibiDesktop?.stopWebhook?.() : await window.hibiDesktop?.startWebhook?.(); if (value) { setWebhook(value); setNotice(value.running ? `Webhook listening at ${value.origin}.` : 'Local webhook stopped.'); } } catch { setNotice('Could not change webhook state.'); }
  }
  return <section className="settings-card" aria-label="Integrations"><div className="view-heading"><div><p className="eyebrow">CONNECTED SERVICES</p><h2>Integrations</h2><p className="muted">Connections stay optional. Remote writes always require a separate approval.</p></div><button className="outline" onClick={() => void refresh()}>Refresh status</button></div>{status.map((connector) => <div className="setting-row" key={connector.id}><div><strong>{connector.label}</strong><span>{connector.capabilities.join(' · ')} · {connector.state}</span></div>{connector.state === 'connected' ? <button className="outline" onClick={() => void revoke(connector.id)}>Revoke</button> : connecting === connector.id ? <div style={{ display: 'flex', gap: 8 }}><input aria-label={`${connector.label} access token`} type="password" autoComplete="off" value={credential} placeholder="Access token" onChange={(event) => setCredential(event.target.value)} /><button className="primary" onClick={() => void connect(connector.id)}>Save access token</button></div> : <button className="outline" onClick={() => { setCredential(''); setConnecting(connector.id) }}>Connect securely</button>}</div>)}<div className="settings-divider" /><div className="setting-row"><div><strong>Import preview</strong><span>Preview CSV, JSON, or ICS before choosing a conflict decision.</span></div><button className="outline" onClick={() => inputRef.current?.click()}>Choose file</button><input ref={inputRef} type="file" accept=".csv,.json,.ics,text/calendar,application/json,text/csv" style={{ display: 'none' }} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importFile(file) }} /></div>{preview.length > 0 && <div role="status">{preview.map((item) => <div className="setting-row" key={item.remoteId}><div><strong>{item.title}</strong><span>{item.state}{item.localId ? ' · linked local task' : ''}</span></div><div style={{ display: 'flex', gap: 8 }}><select aria-label={`Import decision for ${item.title}`} defaultValue={item.state === 'conflict' ? 'keep-local' : item.state === 'duplicate' ? 'skip' : 'duplicate'}><option value="keep-local">Keep local</option><option value="keep-remote">Use imported</option><option value="duplicate">Create copy</option><option value="skip">Skip</option></select><button className="outline" onClick={(event) => applyImport(item, (event.currentTarget.previousElementSibling as HTMLSelectElement).value as ImportDecision)}>Apply</button></div></div>)}</div>}<div className="setting-row"><div><strong>Local API</strong><span>Loopback-only API with a revocable Keychain bearer token. Writes return confirmation intents.</span></div><button className="outline" onClick={() => void toggleApi()}>{api ? 'Stop local API' : 'Start local API'}</button></div>{api && <p className="muted" role="status">{api.origin} · Running locally; the token is retained only in Keychain.</p>}<div className="setting-row"><div><strong>Local webhook</strong><span>Signed inbound events stay on this Mac and always require confirmation.</span></div>{webhook.hasSecret ? <button className="outline" onClick={() => void toggleWebhook()}>{webhook.running ? 'Stop webhook' : 'Start webhook'}</button> : <div style={{ display: 'flex', gap: 8 }}><input aria-label="Webhook signing secret" type="password" autoComplete="off" value={webhookSecret} onChange={(event) => setWebhookSecret(event.target.value)} placeholder="Signing secret" /><button className="primary" onClick={() => void configureWebhook()}>Save secret</button></div>}</div>{webhook.running && webhook.origin && <p className="muted" role="status">{webhook.origin}/webhook · Loopback only</p>}<div className="setting-row"><div><strong>Audit</strong><span>{audit.length ? `${audit.length} safe local audit entries` : 'No remote action has been recorded.'}</span></div><button className="outline" onClick={() => void refresh()}>Refresh audit</button></div><p className="muted" aria-live="polite">{notice}</p><p className="muted">Saved credentials are never shown again in this view.</p></section>
}

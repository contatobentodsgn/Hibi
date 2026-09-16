import React from 'react';
import type { NavKey } from './shell/routes';
import { CompanionAssetGallery } from './CompanionAssetGallery';
import { companionAssets } from '../assets/companion-assets';
import { useEffect, useState } from 'react';
import { getCurrentAdapterStatuses } from '../domain/adapter-status';

const adapterStatuses = getCurrentAdapterStatuses();
type NotchStatus = Awaited<ReturnType<NonNullable<NonNullable<Window['hibiDesktop']>['getNotchCapabilities']>>>;

function CompanionStatus() {
  const [status, setStatus] = React.useState<NotchStatus | null>(null);
  const [device, setDevice] = React.useState<{ status: string; firmwareVersion: string | null; capabilities: string[] } | null>(null);
  React.useEffect(() => {
    let current = true;
    window.hibiDesktop?.getNotchCapabilities?.().then((value) => { if (current) setStatus(value); }).catch(() => { if (current) setStatus(null); });
    window.hibiDesktop?.getDeviceState?.().then((value) => { if (current) setDevice(value); }).catch(() => { if (current) setDevice(null); });
    return () => { current = false; };
  }, []);
  const available = status?.nativeHost === true;
  const visible = status?.host.visible === true;
  const detail = !status ? 'Checking native companion…' : available
    ? `Native AppKit panel ${visible ? 'visible' : 'ready'}${status.host.displayId ? ` · display ${status.host.displayId}` : ''}`
    : 'Electron fallback will be used when a companion card is shown.';
  return <section className="settings-card"><div className="setting-row"><div><strong>Notch / companion surface</strong><span>{detail}</span></div><b className={`pill ${available ? 'green' : 'amber'}`}>{available ? (visible ? 'Visible' : 'Ready') : 'Fallback'}</b></div><div className="setting-row"><div><strong>Diagnostics</strong><span>Host state is read through the local Electron bridge; no native window handles leave the main process.</span></div><span className="muted">{status?.adapter ?? 'Local'}</span></div><div className="setting-row"><div><strong>Physical device</strong><span>{device?.status === 'available' ? `${device.firmwareVersion ?? 'Unknown firmware'} · ${device.capabilities.length} capabilities` : 'No approved transport or protocol connected.'}</span></div><b className={`pill ${device?.status === 'available' ? 'green' : 'amber'}`}>{device?.status === 'available' ? 'Connected' : 'Protocol required'}</b></div></section>;
}

export function AvailabilityView({ kind, onNavigate }: { kind: 'updates' | 'hardware'; onNavigate: (route: NavKey) => void }) {
  const updates = kind === 'updates';
  const [update, setUpdate] = useState<{ status: string; version: string | null; error: string | null; percent?: number }>({ status: 'disabled', version: null, error: null });
  useEffect(() => { if (!updates || !window.hibiDesktop?.getUpdateState) return; void window.hibiDesktop.getUpdateState().then(setUpdate); return window.hibiDesktop.onUpdateState?.(setUpdate); }, [updates]);
  const updateLabel = update.status === 'disabled' ? 'Offline mode' : update.status === 'current' ? 'Up to date' : update.status === 'available' ? `Update ${update.version} available` : update.status === 'downloaded' ? 'Ready to restart' : update.status === 'downloading' ? `Downloading ${update.percent ?? 0}%` : update.status === 'error' ? 'Update unavailable' : 'Checking…';
  return <div className="view"><div className="view-heading"><div><p className="eyebrow">{updates ? 'RELEASE CHANNEL' : 'DEVICE DIAGNOSTICS'}</p><h1>{updates ? 'Updates' : 'Hardware'}</h1><p className="muted">{updates ? 'Secure updates are opt-in and remain disabled in local builds.' : 'Local device capabilities and optional surfaces.'}</p></div></div>{updates ? <><section className="list-card" aria-labelledby="updates-status-title" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 220px', gap: 24, padding: 24, alignItems: 'center' }}><div><span className={`pill ${update.status === 'current' || update.status === 'downloaded' ? 'green' : 'amber'}`}>{updateLabel}</span><h2 id="updates-status-title" style={{ font: '500 30px Georgia, serif', margin: '16px 0 8px' }}>{update.status === 'disabled' ? 'No update source configured' : update.status === 'available' ? `Hibi ${update.version} is ready` : update.status === 'downloaded' ? 'Restart to apply update' : 'Hibi update service'}</h2><p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>{update.error || (update.status === 'disabled' ? 'Local builds never contact an update server. External update checks are disabled in offline mode. A signed production build can enable checks with an explicit feed.' : 'Updates are downloaded only after you request them.')}</p><div style={{ marginTop: 20, display: 'flex', gap: 8 }}>{update.status === 'available' && <button className="primary" onClick={() => void window.hibiDesktop?.downloadUpdate?.()}>Download update</button>}{update.status === 'downloaded' && <button className="primary" onClick={() => void window.hibiDesktop?.installUpdate?.()}>Restart and install</button>}{update.status !== 'disabled' && update.status !== 'available' && update.status !== 'downloaded' && <button className="outline" onClick={() => void window.hibiDesktop?.checkForUpdate?.()}>Check for updates</button>}</div></div><img src={companionAssets.updates.homeTintDefault.url} alt="Local update artwork" style={{ width: '100%', borderRadius: 12, display: 'block' }} /></section><section className="settings-card" aria-label="Update availability" style={{ marginTop: 15 }}><div className="setting-row"><div><strong>Current build</strong><span>Hibi Study Replica · local build</span></div><b className="pill green">Current</b></div><div className="setting-row"><div><strong>Update service</strong><span>{update.status === 'disabled' ? 'External update checks are disabled in this build.' : 'Signed feed configured for this build.'}</span></div><b className={`pill ${update.status === 'disabled' ? 'amber' : 'green'}`}>{update.status === 'disabled' ? 'Not configured' : 'Configured'}</b></div></section></> : <><CompanionStatus /><section className="settings-card" aria-labelledby="adapter-status-title" style={{ marginTop: 15 }}><h2 id="adapter-status-title" className="settings-section-title">Adapter status</h2>{adapterStatuses.map((adapter) => <div className="setting-row" key={adapter.id}><div><strong>{adapter.label}</strong><span>{adapter.scope === 'local' ? 'Local capability' : adapter.scope === 'external' ? 'External integration' : 'Hardware integration'}</span></div><b className={`pill ${adapter.status === 'available' ? 'green' : 'amber'}`}>{adapter.status === 'available' ? 'Available' : 'Unavailable'}</b></div>)}</section></>}<CompanionAssetGallery /></div>;
}

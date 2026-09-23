import React from 'react';
import type { NavKey } from './shell/routes';
import { CompanionAssetGallery } from './CompanionAssetGallery';
import { companionAssets } from '../assets/companion-assets';
import { getCurrentAdapterStatuses } from '../domain/adapter-status';
import { UpdatePanel } from './UpdatePanel';

const adapterStatuses = getCurrentAdapterStatuses();
type NotchStatus = Awaited<ReturnType<NonNullable<NonNullable<Window['hibiDesktop']>['getNotchCapabilities']>>>;

function CompanionStatus() {
  const [status, setStatus] = React.useState<NotchStatus | null>(null);
  React.useEffect(() => {
    let current = true;
    window.hibiDesktop?.getNotchCapabilities?.().then((value) => { if (current) setStatus(value); }).catch(() => { if (current) setStatus(null); });
    return () => { current = false; };
  }, []);
  const available = status?.nativeHost === true;
  const visible = status?.host.visible === true;
  const detail = !status ? 'Checking native companion…' : available
    ? `Native AppKit panel ${visible ? 'visible' : 'ready'}${status.host.displayId ? ` · display ${status.host.displayId}` : ''}`
    : 'Electron fallback will be used when a companion card is shown.';
  return <section className="settings-card"><div className="setting-row"><div><strong>Notch / companion surface</strong><span>{detail}</span></div><b className={`pill ${available ? 'green' : 'amber'}`}>{available ? (visible ? 'Visible' : 'Ready') : 'Fallback'}</b></div><div className="setting-row"><div><strong>Diagnostics</strong><span>Host state is read through the local Electron bridge; no native window handles leave the main process.</span></div><span className="muted">{status?.adapter ?? 'Local'}</span></div></section>;
}

export function AvailabilityView({ kind, onNavigate }: { kind: 'updates' | 'hardware'; onNavigate: (route: NavKey) => void }) {
  const updates = kind === 'updates';
  return <div className="view"><div className="view-heading"><div><p className="eyebrow">{updates ? 'RELEASE CHANNEL' : 'DEVICE DIAGNOSTICS'}</p><h1>{updates ? 'Updates' : 'Hardware'}</h1><p className="muted">{updates ? 'Release information for this offline build.' : 'Local device capabilities and optional surfaces.'}</p></div></div>{updates ? <><section className="list-card" aria-labelledby="updates-status-title" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 220px', gap: 24, padding: 24, alignItems: 'center' }}><div><span className="pill amber">Offline mode</span><h2 id="updates-status-title" style={{ font: '500 30px Georgia, serif', margin: '16px 0 8px' }}>No update source configured</h2><p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>This build keeps update checks disabled so the workspace stays fully local. You can continue using the current build without a connection.</p><div style={{ marginTop: 20 }}><button className="outline" onClick={() => onNavigate('settings')}>Open Settings</button></div></div><img src={companionAssets.updates.homeTintDefault.url} alt="Local update artwork" style={{ width: '100%', borderRadius: 12, display: 'block' }} /></section><UpdatePanel /><section className="settings-card" aria-label="Update availability" style={{ marginTop: 15 }}><div className="setting-row"><div><strong>Current build</strong><span>Pixano · local build</span></div><b className="pill green">Current</b></div><div className="setting-row"><div><strong>Update service</strong><span>External update checks are disabled in offline mode.</span></div><b className="pill amber">Not configured</b></div></section></> : <><CompanionStatus /><section className="settings-card" aria-labelledby="adapter-status-title" style={{ marginTop: 15 }}><h2 id="adapter-status-title" className="settings-section-title">Adapter status</h2>{adapterStatuses.map((adapter) => <div className="setting-row" key={adapter.id}><div><strong>{adapter.label}</strong><span>{adapter.scope === 'local' ? 'Local capability' : adapter.scope === 'external' ? 'External integration' : 'Hardware integration'}</span></div><b className={`pill ${adapter.status === 'available' ? 'green' : 'amber'}`}>{adapter.status === 'available' ? 'Available' : 'Unavailable'}</b></div>)}</section></>}<CompanionAssetGallery /></div>;
}

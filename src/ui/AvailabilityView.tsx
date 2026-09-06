import React from 'react';
import type { NavKey } from './AppShell';
import { CompanionAssetGallery } from './CompanionAssetGallery';
import { getCurrentAdapterStatuses } from '../domain/adapter-status';

const adapterStatuses = getCurrentAdapterStatuses();

export function AvailabilityView({ kind, onNavigate }: { kind: 'updates' | 'hardware'; onNavigate: (route: NavKey) => void }) {
  const updates = kind === 'updates';
  return <div className="view"><div className="view-heading"><div><p className="eyebrow">{updates ? 'RELEASE CHANNEL' : 'DEVICE DIAGNOSTICS'}</p><h1>{updates ? 'Updates' : 'Hardware'}</h1><p className="muted">{updates ? 'Release information for this offline build.' : 'Local device capabilities and optional surfaces.'}</p></div></div><section className="settings-card"><div className="setting-row"><div><strong>{updates ? 'Current build' : 'Notch / companion surface'}</strong><span>{updates ? 'Hibi Study Replica · local build' : 'No compatible hardware integration detected'}</span></div><b className="pill amber">{updates ? 'Current' : 'Unavailable'}</b></div><div className="setting-row"><div><strong>{updates ? 'Update service' : 'Diagnostics'}</strong><span>{updates ? 'External update checks are disabled in offline mode.' : 'Use Events to inspect local actions and export a support bundle from Settings.'}</span></div><button className="outline" onClick={() => onNavigate(updates ? 'settings' : 'instrumentation')}>{updates ? 'Open Settings' : 'Open Events'}</button></div></section>{!updates && <section className="settings-card" aria-labelledby="adapter-status-title" style={{ marginTop: 15 }}><h2 id="adapter-status-title" className="settings-section-title">Adapter status</h2>{adapterStatuses.map((adapter) => <div className="setting-row" key={adapter.id}><div><strong>{adapter.label}</strong><span>{adapter.scope === 'local' ? 'Local capability' : adapter.scope === 'external' ? 'External integration' : 'Hardware integration'}</span></div><b className={`pill ${adapter.status === 'available' ? 'green' : 'amber'}`}>{adapter.status === 'available' ? 'Available' : 'Unavailable'}</b></div>)}</section>}<CompanionAssetGallery /></div>;
}

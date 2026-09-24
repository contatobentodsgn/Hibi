import React, { useEffect, useState } from 'react';
import { useT } from '../i18n/LocaleProvider';
import { buildSupportDiagnostics } from './support-diagnostics';

type SnapshotInput = Parameters<typeof buildSupportDiagnostics>[0];
type ViewState = {
  app: SnapshotInput['application'];
  model: SnapshotInput['model'];
  microphone: SnapshotInput['microphone'];
  integrations: SnapshotInput['integrations'];
} | null;

export function SupportDiagnostics({ onEvent }: { onEvent: (action: string, detail: string, result?: string) => void }) {
  const t = useT();
  const [state, setState] = useState<ViewState>(null);
  const [notice, setNotice] = useState('');
  const refresh = async () => {
    const bridge = window.pixanoDesktop;
    const [app, model, permission, voice, integrations] = await Promise.allSettled([
      bridge?.info(), bridge?.getLocalModelState?.(), bridge?.getMicrophonePermission?.(), bridge?.getLocalVoiceState?.(), bridge?.listIntegrationStatus?.(),
    ]);
    const appValue = app.status === 'fulfilled' ? app.value : null;
    const modelValue = model.status === 'fulfilled' ? model.value : null;
    const voiceValue = voice.status === 'fulfilled' ? voice.value : null;
    const permissionValue = permission.status === 'fulfilled' ? permission.value : 'unavailable';
    const integrationsValue = integrations.status === 'fulfilled' ? integrations.value ?? [] : [];
    setState({
      app: { name: appValue?.name ?? 'Pixano', version: appValue?.version ?? 'unknown', localOnly: appValue?.localOnly === true },
      model: { status: modelValue?.status ?? 'unavailable', modelId: modelValue?.modelId ?? null, sizeBytes: modelValue?.sizeBytes },
      microphone: { permission: permissionValue ?? 'unknown', voiceAvailable: Boolean(voiceValue && voiceValue.status !== 'unavailable') },
      integrations: integrationsValue.map(({ id, label, state: status, hasCredential }) => ({ id, label, state: status, hasCredential })),
    });
  };
  useEffect(() => { void refresh(); }, []);

  const exportBundle = () => {
    if (!state) return;
    const snapshot = buildSupportDiagnostics({ application: state.app, model: state.model, microphone: state.microphone, integrations: state.integrations, platform: navigator.platform.toLowerCase().includes('mac') ? 'darwin' : navigator.platform.toLowerCase().includes('win') ? 'win32' : 'linux', exportedAt: new Date().toISOString() });
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pixano-support-diagnostics.json';
    link.click();
    URL.revokeObjectURL(url);
    setNotice(t('data.diagnostics.exported'));
    onEvent('export', 'Exported privacy-safe diagnostics', 'pass');
  };
  const modelStatus = state?.model.status ?? 'unknown';
  const modelLabel: Record<string, string> = {
    ready: t('data.diagnostics.model.ready'), missing: t('data.diagnostics.model.missing'),
    unverified: t('data.diagnostics.model.unverified'), unavailable: t('data.diagnostics.unavailable'), unknown: t('data.diagnostics.unknown'),
  };
  const permissionLabel: Record<string, string> = {
    granted: t('data.diagnostics.permission.granted'), 'not-determined': t('data.diagnostics.permission.notDetermined'),
    denied: t('data.diagnostics.permission.denied'), restricted: t('data.diagnostics.permission.restricted'),
    unavailable: t('data.diagnostics.unavailable'), unknown: t('data.diagnostics.unknown'),
  };
  const integrationLabel: Record<string, string> = {
    connected: t('data.diagnostics.integration.connected'), disconnected: t('data.diagnostics.integration.disconnected'),
    error: t('data.diagnostics.integration.error'), expired: t('data.diagnostics.integration.expired'),
  };
  return <section className="settings-card" aria-labelledby="support-diagnostics-title">
    <h3 id="support-diagnostics-title" className="settings-section-title">{t('data.diagnostics.title')}</h3>
    <p className="muted">{t('data.diagnostics.privacy')}</p>
    <div className="integration-status" aria-live="polite">
      <div className="setting-row"><div><strong>{t('data.diagnostics.version')}</strong><span>{state?.app.version ?? t('data.diagnostics.loading')}</span></div><span className="setting-value">{state?.app.name ?? 'Pixano'}</span></div>
      <div className="setting-row"><div><strong>{t('data.diagnostics.model')}</strong><span>{state?.model.modelId ?? t('data.diagnostics.noModel')}</span></div><span className="setting-value">{modelLabel[modelStatus] ?? t('data.diagnostics.unknown')}</span></div>
      <div className="setting-row"><div><strong>{t('data.diagnostics.microphone')}</strong><span>{state?.microphone.voiceAvailable ? t('data.diagnostics.voiceAvailable') : t('data.diagnostics.unavailable')}</span></div><span className="setting-value">{permissionLabel[state?.microphone.permission ?? 'unknown']}</span></div>
      {(state?.integrations ?? []).map((integration) => <div className="setting-row" key={integration.id}><div><strong>{integration.label}</strong><span>{integration.hasCredential ? t('data.diagnostics.credentialSaved') : t('data.diagnostics.noCredential')}</span></div><span className="setting-value">{integrationLabel[integration.state] ?? t('data.diagnostics.unknown')}</span></div>)}
    </div>
    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
      <button className="outline" onClick={() => void refresh()}>{t('data.diagnostics.refresh')}</button>
      <button className="outline" disabled={!state} onClick={exportBundle}>{t('data.diagnostics.export')}</button>
    </div>
    <p className="muted" role="status" aria-live="polite" style={{ margin: notice ? '8px 0 0' : 0 }}>{notice}</p>
  </section>;
}

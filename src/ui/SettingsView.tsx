import React, { useEffect, useRef, useState } from 'react';
import type { StudyData } from '../domain/models';
import { createWorkspaceBackup, parseWorkspaceBackup, type WorkspacePreferences } from '../data/workspace-backup';
import type { AiFallbackPolicy, AiModelPresetId } from '../ai/contracts';
import { recommendedModelPresets } from '../ai/production';
import { IntegrationsView } from './IntegrationsView';
import { NotchDisplaySettings } from './NotchDisplaySettings';
import type { AiUsageRecord } from '../ai/usage';
import { useLocale, useT } from '../i18n/LocaleProvider';
import type { DictionaryKey } from '../i18n/dictionary';
import type { Locale } from '../i18n/format';
import { AppearanceSettings } from './redesign/settings/AppearanceSettings';
import { AWAY_BEHAVIORS, DEFAULT_FOCUS_SETTINGS, FOCUS_LOOP_ANIMATIONS, IDLE_MINUTES, NUDGE_PRESETS, SCREEN_TIMEOUT_SECONDS, SESSION_LENGTHS, previewDailyAlerts, sanitizeFocusSettings, type AwayBehavior, type FocusLoopAnimation, type FocusSettings, type NudgePreset } from './focus-settings';
import { getCurrentAdapterStatuses } from '../domain/adapter-status';
import { buildNotificationEntries } from '../domain/notifications';
import { pluralize } from '../i18n/plural';
import { LocalModelSettings } from './LocalModelSettings';
import { ShortcutSettings } from './ShortcutSettings';
import type { NotionLocalMutation } from '../integrations/notion-apply';
import { createDesktopWorkspaceBackend, createWorkspaceStore, type WorkspaceRestorePoint } from '../data/workspace-store';
import { restorePointDate, restorePointSize, restorePointText, restorePointsEmptyKey } from './restore-point-format';

export type SettingsViewProps = { data: StudyData; onEvent: (action: string, detail: string, result?: string) => void; onReset: () => void; onRestore?: (data: StudyData, preferences: WorkspacePreferences) => void; onTestNotification?: () => Promise<boolean>; aiFallbackPolicy?: AiFallbackPolicy; onAiFallbackPolicyChange?: (policy: AiFallbackPolicy) => void; aiUsage?: readonly AiUsageRecord[]; onApplyImport?: (candidate: import('../integrations/imports').ImportCandidate, decision: import('../integrations/imports').ImportDecision, localId?: string, connectorId?: string) => void; onApplyNotion?: (mutations: readonly NotionLocalMutation[]) => readonly import('../domain/models').Task[]; onMoveBlock?: (id: string, start: string, end: string) => boolean; focusSettings?: FocusSettings; onFocusSettingsChange?: (settings: FocusSettings) => void; initialTab?: 'General' | 'AI' | 'Integrations' | 'Focus' | 'Notifications' | 'Data' | 'About' };
type Props = SettingsViewProps;
type AiConfig = { provider: 'local' | 'openai-compatible'; endpoint: string; model: string; hasApiKey: boolean };
const DEFAULT_AI_CONFIG: AiConfig = { provider: 'local', endpoint: '', model: 'local-tool-provider', hasApiKey: false };

type LaunchAtLoginBridge = Readonly<{
  getOpenAtLogin: () => Promise<boolean>;
  setOpenAtLogin: (enabled: boolean) => Promise<boolean>;
}>;

type Translate = (key: DictionaryKey) => string;

// `translate` não interpola. A substituição por função evita que um `$&` no endpoint seja reinterpretado.
const fillTemplate = (template: string, values: Record<string, string>): string =>
  Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, () => value), template);

// O processo principal devolve só a mensagem segura `AI provider request failed: <código>.`,
// que o ipcRenderer ainda prefixa — é esse código que decide o que a tela diz. Um pedido recusado
// (endpoint ou id de modelo errado) precisa nomear endpoint e modelo, e não culpar a resposta.
export function aiSaveFailureMessage(error: unknown, config: { endpoint: string; model: string }, t: Translate): string {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('invalid_request')) return fillTemplate(t('settings.ai.invalidRequest'), { endpoint: config.endpoint, model: config.model });
  if (message.includes('invalid_credentials')) return t('settings.ai.invalidCredentials');
  if (message.includes('invalid_response')) return t('settings.ai.invalidResponse');
  if (message.includes('rate_limited')) return t('settings.ai.rateLimited');
  if (message.includes('unavailable')) return t('settings.ai.unavailable');
  return message || t('settings.ai.saveFailed');
}

export function usageSummaryFor(entries: readonly AiUsageRecord[]) {
  return entries.reduce((summary, entry) => ({ turns: summary.turns + 1, totalTokens: summary.totalTokens + entry.totalTokens, estimatedCost: summary.estimatedCost + (entry.estimatedCost ?? 0) }), { turns: 0, totalTokens: 0, estimatedCost: 0 })
}

export async function syncLaunchAtLogin(bridge: LaunchAtLoginBridge, enabled: boolean): Promise<boolean> {
  await bridge.setOpenAtLogin(enabled);
  return bridge.getOpenAtLogin();
}

export function AiSettings({ onEvent, fallbackPolicy = 'automatic', onFallbackPolicyChange, usage = [] }: Pick<Props, 'onEvent' | 'aiUsage'> & { fallbackPolicy?: AiFallbackPolicy; onFallbackPolicyChange?: (policy: AiFallbackPolicy) => void; usage?: readonly AiUsageRecord[] }) {
  const t = useT();
  const [config, setConfig] = useState<AiConfig>(DEFAULT_AI_CONFIG);
  const [apiKey, setApiKey] = useState('');
  const [modelPreset, setModelPreset] = useState<AiModelPresetId>('custom');
  const [notice, setNotice] = useState('Local assistant is active.');
  useEffect(() => { let active = true; void window.hibiDesktop?.getAiConfig?.().then((saved) => { if (active) { setConfig(saved); setNotice(saved.hasApiKey ? 'A key is securely stored in Keychain.' : 'No API key is stored.'); } }).catch(() => { if (active) setNotice('AI settings are available in the desktop app.'); }); return () => { active = false; }; }, []);
  const external = config.provider === 'openai-compatible';
  const usageSummary = usageSummaryFor(usage);
  const save = async () => {
    try {
      const saved = await window.hibiDesktop?.saveAiConfig?.({ provider: config.provider, endpoint: config.endpoint, model: config.model, ...(apiKey ? { apiKey } : {}) });
      if (saved) { setConfig(saved); setApiKey(''); setNotice(saved.hasApiKey ? 'AI settings saved. The key remains only in Keychain.' : 'AI settings saved.'); onEvent('edit', `AI provider: ${saved.provider}`, 'pass'); }
      else setNotice('AI settings require the desktop app.');
    } catch (error) { setNotice(aiSaveFailureMessage(error, { endpoint: config.endpoint, model: config.model }, t)); }
  };
  const removeKey = async () => {
    try { const saved = await window.hibiDesktop?.deleteAiKey?.(); if (saved) { setConfig(saved); setNotice('API key removed from Keychain.'); onEvent('edit', 'Removed AI API key', 'pass'); } }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not remove API key.'); }
  };
  return <div className="ai-settings">
    <Setting title="Provider" detail="Choose where AI requests are sent"><select aria-label="Provider" value={config.provider} onChange={(event) => { const local = event.target.value === 'local'; setConfig((current) => local ? DEFAULT_AI_CONFIG : { ...current, provider: 'openai-compatible' }); if (local) setApiKey(''); }}><option value="local">Hibi local</option><option value="openai-compatible">OpenAI-compatible</option></select></Setting>
    <Setting title="Endpoint" detail="HTTPS endpoint for the compatible provider"><input aria-label="Endpoint" disabled={!external} value={config.endpoint} placeholder="https://api.example.com/v1/chat/completions" onChange={(event) => setConfig((current) => ({ ...current, endpoint: event.target.value }))} /></Setting>
    <Setting title="Model preset" detail={recommendedModelPresets.find((preset) => preset.id === modelPreset)?.description ?? ''}><select aria-label="Model preset" value={modelPreset} onChange={(event) => setModelPreset(event.target.value as AiModelPresetId)}>{recommendedModelPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></Setting>
    <Setting title="Model" detail="Enter the model identifier supported by your provider"><input aria-label="Model" disabled={!external} value={config.model} placeholder="gpt-4.1-mini" onChange={(event) => setConfig((current) => ({ ...current, model: event.target.value }))} /></Setting>
    <Setting title="Fallback policy" detail="Choose what happens when a configured provider is temporarily unavailable"><select aria-label="Fallback policy" value={fallbackPolicy} onChange={(event) => { const policy = event.target.value as AiFallbackPolicy; if (policy === 'ask' || policy === 'automatic' || policy === 'never') { onFallbackPolicyChange?.(policy); onEvent('edit', `AI fallback: ${policy}`, 'pass'); } }}><option value="ask">Ask before using local fallback</option><option value="automatic">Automatically use local fallback</option><option value="never">Never use local fallback</option></select></Setting>
    <Setting title="API key" detail="Stored only in macOS Keychain"><div style={{ display: 'flex', gap: 8 }}><input aria-label="API key" disabled={!external} value={apiKey} type="password" autoComplete="off" placeholder={config.hasApiKey ? 'Key stored securely' : 'Paste a key to save'} onChange={(event) => setApiKey(event.target.value)} />{config.hasApiKey && <button className="outline" onClick={() => void removeKey()}>Remove key</button>}</div></Setting>
    <Setting title="Local usage" detail={`${usageSummary.turns} completed turns · ${usageSummary.totalTokens} tokens · ${usageSummary.estimatedCost ? `estimated $${usageSummary.estimatedCost.toFixed(4)}` : 'cost unavailable for unknown models'}`}><span className="setting-value">Local only</span></Setting>
    <p className="muted">The endpoint, key, and model are tested before any setting is saved.</p><p className="muted" aria-live="polite" style={{ margin: '12px 0' }}>{notice}</p><button className="primary" onClick={() => void save()}>{external ? 'Test connection & save' : 'Save AI settings'}</button>
  </div>;
}

const NUDGE_PRESET_IDS: readonly NudgePreset[] = ['calm', 'work', 'wellbeing'];

/**
 * Ajustes › Foco. Cada controle aqui governa o comportamento de verdade — o valor escolhido desce
 * para o portão em `electron/focus-gate.mjs`, que é quem decide o que dispara e quando.
 *
 * Foi assim de propósito: o app original entregou uma aba de Foco que NÃO governava nada (o horário
 * ativo dizia 09:00–17:00 e os lembretes apareciam o dia todo), e uma versão depois continuava sem
 * governar. Copiar a lista de controles teria sido copiar o defeito — por isso o portão veio primeiro
 * e a tela só ganhou botões depois que o comportamento passou a ser verdade.
 */
export function FocusSettingsPanel({ settings, onChange, data, onEvent }: { settings: FocusSettings; onChange?: (settings: FocusSettings) => void; data: StudyData; onEvent: Props['onEvent'] }) {
  const t = useT();
  const { language } = useLocale();
  const minutes = (count: number) => pluralize(language, count, 'focus.count.minute.one', 'focus.count.minute.other');
  const update = (patch: Partial<FocusSettings>, detail: string) => {
    const next = sanitizeFocusSettings({ ...settings, ...patch });
    onChange?.(next);
    onEvent('edit', `Focus · ${detail}`, 'pass');
  };
  // A prévia NÃO é uma estimativa paralela: `previewDailyAlerts` chama a mesma função que arma cada
  // timer no agendador. Uma prévia capaz de discordar da realidade é exatamente como "09:00–17:00"
  // virou enfeite no app original.
  const alertsPerDay = previewDailyAlerts(buildNotificationEntries(data), settings);
  // "30 segundos", "1 minuto", "5 minutos": nunca `after 1 minutes`, o plural quebrado do original.
  const duration = (totalSeconds: number) => totalSeconds < 60 ? pluralize(language, totalSeconds, 'focus.count.second.one', 'focus.count.second.other') : minutes(Math.round(totalSeconds / 60));
  const withDuration = (key: DictionaryKey, totalSeconds: number) => fillTemplate(t(key), { duration: duration(totalSeconds) });
  // O timeout de tela só tem quem o honre com o Taby conectado. Hoje o adaptador de hardware está
  // indisponível, e a tela diz isso em vez de fingir que o ajuste mudou alguma coisa.
  const tabyConnected = getCurrentAdapterStatuses().some((adapter) => adapter.id === 'hardware' && adapter.status === 'available');
  const watchesPresence = settings.awayBehavior !== 'keep';
  return <>
    <Setting title={t('focus.settings.session.title')} detail={t('focus.settings.session.detail')}>
      <select aria-label={t('focus.settings.session.title')} value={settings.sessionMinutes} onChange={(event) => update({ sessionMinutes: Number(event.target.value) }, `session ${event.target.value}m`)}>
        {SESSION_LENGTHS.map((value) => <option key={value} value={value}>{minutes(value)}</option>)}
      </select>
    </Setting>
    <Setting title={t('focus.settings.activeHours.title')} detail={t('focus.settings.activeHours.detail')}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input aria-label={t('focus.settings.activeHours.start')} type="time" value={settings.activeStart} onChange={(event) => update({ activeStart: event.target.value }, `active from ${event.target.value}`)} />
        <input aria-label={t('focus.settings.activeHours.end')} type="time" value={settings.activeEnd} onChange={(event) => update({ activeEnd: event.target.value }, `active until ${event.target.value}`)} />
      </div>
    </Setting>
    <Setting title={t('focus.settings.preset.title')} detail={t('focus.settings.preset.detail')}>
      <select aria-label={t('focus.settings.preset.title')} value={settings.nudgePreset} onChange={(event) => update({ nudgePreset: event.target.value as NudgePreset }, `preset ${event.target.value}`)}>
        {NUDGE_PRESET_IDS.map((preset) => <option key={preset} value={preset}>{`${t(`focus.settings.preset.${preset}` as DictionaryKey)} · ${minutes(NUDGE_PRESETS[preset])}`}</option>)}
      </select>
    </Setting>
    <Setting title={t('focus.settings.preview.title')} detail={t('focus.settings.preview.detail')}>
      <span className="setting-value">{pluralize(language, alertsPerDay, 'focus.count.alert.one', 'focus.count.alert.other')}</span>
    </Setting>
    <Setting title={t('focus.settings.away.title')} detail={t('focus.settings.away.detail')}>
      <select aria-label={t('focus.settings.away.title')} value={settings.awayBehavior} onChange={(event) => update({ awayBehavior: event.target.value as AwayBehavior }, `away ${event.target.value}`)}>
        {AWAY_BEHAVIORS.map((behavior) => <option key={behavior} value={behavior}>{t(`focus.settings.away.${behavior}` as DictionaryKey)}</option>)}
      </select>
    </Setting>
    <Setting title={t('focus.settings.idle.title')} detail={watchesPresence ? t('focus.settings.idle.detail') : t('focus.settings.idle.detailKeep')}>
      <select aria-label={t('focus.settings.idle.title')} disabled={!watchesPresence} value={settings.idleMinutes} onChange={(event) => update({ idleMinutes: Number(event.target.value) }, `idle ${event.target.value}m`)}>
        {IDLE_MINUTES.map((value) => <option key={value} value={value}>{withDuration('focus.settings.idle.option', value * 60)}</option>)}
      </select>
    </Setting>
    <Setting title={t('focus.settings.loop.title')} detail={t('focus.settings.loop.detail')}>
      <select aria-label={t('focus.settings.loop.title')} value={settings.focusLoopAnimation} onChange={(event) => update({ focusLoopAnimation: event.target.value as FocusLoopAnimation }, `loop ${event.target.value}`)}>
        {FOCUS_LOOP_ANIMATIONS.map((loop) => <option key={loop} value={loop}>{t(`focus.settings.loop.${loop}` as DictionaryKey)}</option>)}
      </select>
    </Setting>
    <Setting title={t('focus.settings.screen.title')} detail={t('focus.settings.screen.detail')}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select aria-label={t('focus.settings.screen.title')} value={settings.screenTimeoutSeconds} onChange={(event) => update({ screenTimeoutSeconds: Number(event.target.value) }, `taby screen ${event.target.value}s`)}>
          {SCREEN_TIMEOUT_SECONDS.map((value) => <option key={value} value={value}>{withDuration('focus.settings.screen.option', value)}</option>)}
        </select>
        {!tabyConnected && <b className="pill amber">{t('focus.settings.screen.disconnected')}</b>}
      </div>
    </Setting>
    <p className="muted">{t('focus.quiet')}</p>
  </>;
}

export function SettingsView({ data, onEvent, onReset, onRestore, onTestNotification, aiFallbackPolicy, onAiFallbackPolicyChange, aiUsage, onApplyImport, onApplyNotion, onMoveBlock, focusSettings, onFocusSettingsChange, initialTab = 'General' }: SettingsViewProps) {
  const [tab, setTab] = useState<'General' | 'AI' | 'Integrations' | 'Focus' | 'Notifications' | 'Data' | 'About'>(initialTab);
  const { language, setLanguage, twentyFourHour, setTwentyFourHour } = useLocale();
  const t = useT();
  const [launchAtLogin, setLaunchAtLogin] = useState(false);
  const [launchNotice, setLaunchNotice] = useState('');
  const [backupNotice, setBackupNotice] = useState('');
  const [restorePoints, setRestorePoints] = useState<readonly WorkspaceRestorePoint[]>([]);
  const [restorePointsNotice, setRestorePointsNotice] = useState('');
  const importRef = useRef<HTMLInputElement>(null);
  const desktopBridge = typeof window === 'undefined' ? undefined : window.hibiDesktop;
  const workspaceStore = React.useMemo(() => typeof window === 'undefined' ? createWorkspaceStore({ storage: { getItem: () => null, setItem: () => undefined }, database: null }) : createWorkspaceStore({ storage: window.localStorage, database: createDesktopWorkspaceBackend(window.hibiDesktop) }), []);
  useEffect(() => { let active = true; const bridge = window.hibiDesktop; if (!bridge?.getOpenAtLogin) { setLaunchNotice('Available in the desktop app.'); return () => { active = false; }; } void bridge.getOpenAtLogin().then((value) => { if (active) { setLaunchAtLogin(value); setLaunchNotice(''); } }).catch(() => { if (active) setLaunchNotice('Could not read the macOS startup setting.'); }); return () => { active = false; }; }, []);
  const testNotification = async () => { const shown = await onTestNotification?.() ?? false; onEvent('test', 'Native notifications', shown ? 'pass' : 'unsupported'); };
  const exportBundle = () => { const url = URL.createObjectURL(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), app: 'Hibi', data }, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'hibi-support-bundle.json'; link.click(); URL.revokeObjectURL(url); onEvent('export', 'Exported support bundle', 'pass'); };
  const focus = focusSettings ?? DEFAULT_FOCUS_SETTINGS;
  const workspacePreferences = (): WorkspacePreferences => ({ language, twentyFourHour, focus });
  const exportWorkspace = () => { const backup = createWorkspaceBackup(data, workspacePreferences()); const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'hibi-workspace-backup.json'; link.click(); URL.revokeObjectURL(url); setBackupNotice('Workspace backup exported. API keys and Keychain items are never included.'); onEvent('export', 'Exported workspace backup', 'pass'); };
  const importWorkspace = async (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file || !onRestore) return; try { const backup = parseWorkspaceBackup(await file.text(), data); if (!window.confirm('Replace this local workspace with the imported backup? This cannot be undone unless you export a backup first.')) return; onRestore(backup.data, backup.preferences); setLanguage(backup.preferences.language); setTwentyFourHour(backup.preferences.twentyFourHour); onFocusSettingsChange?.(backup.preferences.focus); setBackupNotice(`Workspace restored from ${file.name}.`); onEvent('import', 'Restored workspace backup', 'pass'); } catch (error) { setBackupNotice(error instanceof Error ? error.message : 'Could not restore this backup.'); onEvent('import', 'Rejected workspace backup', 'fail'); } };
  useEffect(() => { if (tab !== 'Data') return; let active = true; setRestorePointsNotice(''); void workspaceStore.restorePoints().then((points) => { if (active) setRestorePoints(points); }).catch((error) => { if (active) { setRestorePoints([]); setRestorePointsNotice(error instanceof Error ? error.message : 'Could not read the restore points.'); } }); return () => { active = false; }; }, [tab, workspaceStore]);
  const restoreFromPoint = async (point: WorkspaceRestorePoint) => { const name = restorePointText(point, t); if (!window.confirm(`Restore workspace from “${name}”? The current workspace will be replaced.`)) return; try { await workspaceStore.restore(point.id); onEvent('restore', name, 'pass'); window.location.reload(); } catch (error) { setRestorePointsNotice(error instanceof Error ? error.message : 'Could not restore this point.'); onEvent('restore', name, 'fail'); } };
  const tabs = ['General', 'AI', 'Integrations', 'Focus', 'Notifications', 'Data', 'About'] as const;
  return <div className="view settings-view"><div className="view-heading"><div><p className="eyebrow">HIBI STUDY REPLICA</p><h1>Settings</h1><p className="muted">Local preferences · {data.tasks.length} tasks · {data.reminders.length} reminders</p></div></div><div className="settings-layout"><aside className="settings-tabs" aria-label="Settings sections">{tabs.map((item) => <button key={item} className={tab === item ? 'active' : ''} aria-current={tab === item ? 'page' : undefined} onClick={() => { setTab(item); onEvent('navigation', `Settings · ${item}`); }}>{item}</button>)}</aside><section className="settings-card"><h2 className="settings-section-title">{tab}</h2>{tab === 'General' && <><ShortcutSettings onEvent={onEvent} /><Setting title="Language" detail="Interface language"><select aria-label="Language" value={language} onChange={(event) => { const next = event.target.value as Locale; setLanguage(next); onEvent('edit', 'Language', next); }}><option value="pt">Português (Brasil)</option><option value="en">English</option></select></Setting><AppearanceSettings onEvent={onEvent} framed /><Setting title="Time format" detail="Use clear, exact times across calendar and reminders"><button className={`toggle ${twentyFourHour ? 'on' : ''}`} aria-pressed={twentyFourHour} onClick={() => { const next = !twentyFourHour; setTwentyFourHour(next); onEvent('edit', 'Time format', next ? '24h' : '12h'); }}><span />{twentyFourHour ? '24-hour' : 'AM / PM'}</button></Setting><Setting title="Launch at login" detail="Open Hibi automatically when this Mac starts"><button className={`toggle ${launchAtLogin ? 'on' : ''}`} aria-pressed={launchAtLogin} onClick={async () => { const bridge = window.hibiDesktop; if (!bridge?.setOpenAtLogin || !bridge.getOpenAtLogin) { setLaunchNotice('Available in the desktop app.'); return; } try { const applied = await syncLaunchAtLogin({ setOpenAtLogin: bridge.setOpenAtLogin, getOpenAtLogin: bridge.getOpenAtLogin }, !launchAtLogin); setLaunchAtLogin(applied); setLaunchNotice(applied === !launchAtLogin ? '' : 'macOS kept its current startup setting.'); onEvent('edit', 'Launch at login', String(applied)); } catch { setLaunchNotice('Could not update the macOS startup setting.'); } }}><span />{launchAtLogin ? 'On' : 'Off'}</button>{launchNotice && <p className="muted" aria-live="polite" style={{ margin: '8px 0 0' }}>{launchNotice}</p>}</Setting><NotchDisplaySettings onEvent={onEvent} /></>}{tab === 'AI' && <><AiSettings onEvent={onEvent} fallbackPolicy={aiFallbackPolicy} onFallbackPolicyChange={onAiFallbackPolicyChange} usage={aiUsage} /><div className="settings-divider" /><LocalModelSettings onEvent={onEvent} /></>}{tab === 'Integrations' && <IntegrationsView onEvent={onEvent} localRecords={data.tasks.map((task) => ({ id: task.id, title: task.title, remoteRef: task.remoteRef }))} localTasks={data.tasks} localBlocks={data.blocks} onApplyImport={onApplyImport} onApplyNotion={onApplyNotion} onMoveBlock={onMoveBlock} />}{tab === 'Focus' && <FocusSettingsPanel settings={focus} onChange={onFocusSettingsChange} data={data} onEvent={onEvent} />}{tab === 'Notifications' && <><Setting title="Native notifications" detail="Verify macOS alerts for reminders and deadlines"><button className="outline" onClick={testNotification}>Send test notification</button></Setting><div className="settings-divider" /><div className="integration-status"><Status name="macOS notifications" state="Connected" /><Status name="Scheduled reminders" state={`${data.reminders.filter((item) => item.status !== 'paused').length} active`} /></div></>}{tab === 'Data' && <><Setting title="Workspace backup" detail="Export or restore tasks, calendar, reminders, notes, habits, goals and safe preferences"><div style={{ display: 'flex', gap: 8 }}><button className="outline" onClick={exportWorkspace}>Export backup</button><button className="outline" onClick={() => importRef.current?.click()} disabled={!onRestore}>Restore backup</button><input ref={importRef} aria-label="Choose Hibi workspace backup" type="file" accept="application/json,.json" onChange={(event) => void importWorkspace(event)} style={{ display: 'none' }} /></div></Setting>{backupNotice && <p className="muted" role="status" aria-live="polite" style={{ margin: '0 0 16px' }}>{backupNotice}</p>}<Setting title="Restore points" detail="Return the workspace to a safe point created before a destructive action"><div className="restore-points" aria-live="polite">{restorePointsNotice && <p className="muted" role="status">{restorePointsNotice}</p>}{restorePoints.length ? <ul className="audit-history" aria-label="Workspace restore points">{restorePoints.map((point) => <li className="event-row" key={point.id}><div><strong>{restorePointText(point, t)}</strong><span>{restorePointDate(point.createdAt, language)} · {restorePointSize(point.bytes)}</span></div><button className="outline" onClick={() => void restoreFromPoint(point)}>Restore</button></li>)}</ul> : <p className="muted">{t(restorePointsEmptyKey(desktopBridge))}</p>}</div></Setting><Setting title="Support bundle" detail="Export a local diagnostic snapshot for review"><button className="outline" onClick={exportBundle}>Export JSON</button></Setting><Setting title="Study data" detail={`Restore the local seed dataset · ${data.blocks.length} schedule blocks`}><button className="outline" onClick={onReset}>Reset study data</button></Setting></>}{tab === 'About' && <><p className="muted">Hibi is an offline-first personal planning workspace.</p><div className="settings-divider" /><h3 className="eyebrow">INTEGRATION STATUS</h3><div className="integration-status"><Status name="Local calendar" state="Connected" /><Status name="ICS import/export" state="Available locally" /><Status name="External calendar sync" state="Not configured" /><Status name="Brain / hardware" state="Unavailable offline" /></div></>}</section></div></div>;
}

function Setting({ title, detail, children }: { title: string; detail: string; children: React.ReactNode }) { return <div className="setting-row"><div><strong>{title}</strong><span>{detail}</span></div>{children}</div>; }
function Status({ name, state }: { name: string; state: string }) { return <div className="integration-row"><span>{name}</span><b>{state}</b></div>; }

import React, { useEffect, useState } from 'react';
import { useLocale, useT } from '../i18n/LocaleProvider';
import { AUTO_NOTCH_VALUE, disconnectedPreference, fillDisplay, notchDisplayOptions, notchTestMessage, resolvedNotchDisplay, selectedNotchValue, type NotchDisplayState } from './notch-display';

type Props = { onEvent: (action: string, detail: string, result?: string) => void };

// Mesma marcação de `Setting` em SettingsView, sem importar de lá para não criar ciclo.
function Row({ title, detail, note, children }: { title: string; detail: string; note?: string; children: React.ReactNode }) {
  return <div className="setting-row"><div><strong>{title}</strong><span>{detail}</span>{note && <span>{note}</span>}</div>{children}</div>;
}

export function NotchDisplaySettings({ onEvent }: Props) {
  const t = useT();
  const { language } = useLocale();
  const [state, setState] = useState<NotchDisplayState | null>(null);
  const [available, setAvailable] = useState(true);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const bridge = window.hibiDesktop;
    const list = bridge?.listNotchDisplays;
    if (!list) { setAvailable(false); return undefined; }
    let active = true;
    const refresh = () => { void list().then((next) => { if (active) setState(next); }).catch(() => { if (active) setAvailable(false); }); };
    refresh();
    const unsubscribe = bridge.onNotchDisplaysChanged?.(refresh) ?? (() => undefined);
    return () => { active = false; unsubscribe(); };
  }, []);

  if (!available) return <Row title={t('settings.notch.title')} detail={t('settings.notch.detail')}><span className="setting-value">{t('settings.notch.desktopOnly')}</span></Row>;

  const choose = async (value: string) => {
    const setDisplay = window.hibiDesktop?.setNotchDisplay;
    if (!setDisplay) return;
    try {
      setState(await setDisplay(value === AUTO_NOTCH_VALUE ? null : Number(value)));
      setNotice('');
      onEvent('edit', 'Notch display', value);
    } catch { setNotice(t('settings.notch.saveFailed')); }
  };
  const runTest = async () => {
    const testNotch = window.hibiDesktop?.testNotch;
    if (!testNotch) return;
    setTesting(true);
    setNotice('');
    try {
      const result = await testNotch(language);
      setNotice(notchTestMessage(result, t));
      onEvent('test', 'Notch', result.outcome);
    } catch {
      setNotice(t('settings.notch.result.failed'));
      onEvent('test', 'Notch', 'failed');
    } finally { setTesting(false); }
  };

  const options = state ? notchDisplayOptions(state, t) : [{ value: AUTO_NOTCH_VALUE, label: t('settings.notch.auto'), disabled: false }];
  const fallback = state && disconnectedPreference(state) ? fillDisplay(t('settings.notch.fallback'), resolvedNotchDisplay(state)?.label ?? t('settings.notch.unknownDisplay')) : undefined;
  return <>
    <Row title={t('settings.notch.title')} detail={t('settings.notch.detail')} note={fallback}>
      <select aria-label={t('settings.notch.title')} disabled={!state} value={state ? selectedNotchValue(state) : AUTO_NOTCH_VALUE} onChange={(event) => void choose(event.target.value)}>
        {options.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
      </select>
    </Row>
    <Row title={t('settings.notch.test.title')} detail={t('settings.notch.test.detail')}>
      <div>
        <button className="outline" disabled={testing || !state} onClick={() => void runTest()}>{testing ? t('settings.notch.test.running') : t('settings.notch.test.button')}</button>
        <p className="muted" role="status" aria-live="polite" style={{ margin: '8px 0 0' }}>{notice}</p>
      </div>
    </Row>
  </>;
}

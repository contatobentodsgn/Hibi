import React, { useEffect, useState } from 'react';
import { useLocale, useT } from '../i18n/LocaleProvider';
import { AUTO_NOTCH_VALUE, disconnectedPreference, fillDisplay, notchDisplayOptions, notchTestMessage, resolvedNotchDisplay, selectedNotchValue, type NotchDisplayState } from './notch-display';

type Props = { onEvent: (action: string, detail: string, result?: string) => void };

const NOTE_ID = 'notch-display-note';

// Mesma marcação de `Setting` em SettingsView, sem importar de lá para não criar ciclo.
function Row({ title, detail, note, noteId, children }: { title: string; detail: string; note?: string; noteId?: string; children: React.ReactNode }) {
  return <div className="setting-row"><div><strong>{title}</strong><span>{detail}</span>{note && <span id={noteId}>{note}</span>}</div>{children}</div>;
}

export function NotchDisplaySettings({ onEvent }: Props) {
  const t = useT();
  const { language } = useLocale();
  const [state, setState] = useState<NotchDisplayState | null>(null);
  // `available` só indica se a ponte existe; falhas de leitura não devem escondê-la de novo.
  const [available] = useState(() => typeof window !== 'undefined' && Boolean(window.hibiDesktop?.listNotchDisplays));
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const bridge = window.hibiDesktop;
    const list = bridge?.listNotchDisplays;
    if (!list) return undefined;
    let active = true;
    const refresh = () => {
      void list().then((next) => {
        if (!active) return;
        setState(next);
        setLoadFailed(false);
      }).catch(() => { if (active) setLoadFailed(true); });
    };
    refresh();
    const unsubscribe = bridge.onNotchDisplaysChanged?.(refresh) ?? (() => undefined);
    return () => { active = false; unsubscribe(); };
  }, []);

  if (!available) return <Row title={t('settings.notch.title')} detail={t('settings.notch.detail')}><span className="setting-value">{t('settings.notch.desktopOnly')}</span></Row>;

  const choose = async (value: string) => {
    const setDisplay = window.hibiDesktop?.setNotchDisplay;
    if (!setDisplay) return;
    try {
      const next = await setDisplay(value === AUTO_NOTCH_VALUE ? null : Number(value));
      setState(next);
      setSaveFailed(false);
      onEvent('edit', 'Notch display', value);
    } catch { setSaveFailed(true); }
  };
  const runTest = async () => {
    if (testing) return;
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
  // Precedência da nota da linha: falha ao salvar > falha ao ler > aviso de desconectado.
  const rowNote = saveFailed ? t('settings.notch.saveFailed') : loadFailed ? t('settings.notch.loadFailed') : fallback;
  return <>
    <Row title={t('settings.notch.title')} detail={t('settings.notch.detail')} note={rowNote} noteId={rowNote ? NOTE_ID : undefined}>
      <select aria-label={t('settings.notch.title')} aria-describedby={rowNote ? NOTE_ID : undefined} disabled={!state} value={state ? selectedNotchValue(state) : AUTO_NOTCH_VALUE} onChange={(event) => void choose(event.target.value)}>
        {options.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
      </select>
    </Row>
    <Row title={t('settings.notch.test.title')} detail={t('settings.notch.test.detail')}>
      <div>
        <button className="outline" aria-disabled={testing} disabled={!state} onClick={() => void runTest()}>{testing ? t('settings.notch.test.running') : t('settings.notch.test.button')}</button>
        <p className="muted" role="status" aria-live="polite" style={{ margin: notice ? '8px 0 0' : 0 }}>{notice}</p>
      </div>
    </Row>
  </>;
}

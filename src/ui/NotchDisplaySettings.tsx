import React, { useEffect, useRef, useState } from 'react';
import { useLocale, useT } from '../i18n/LocaleProvider';
import { AUTO_NOTCH_VALUE, disconnectedPreference, fillDisplay, notchDisplayOptions, notchTestMessage, resolvedNotchDisplay, selectedNotchValue, type NotchDisplayState } from './notch-display';
import { TintSettings } from './TintSettings';

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
  // Leituras e gravações disputam o mesmo estado: uma resposta só vale se nenhuma requisição mais nova começou depois dela.
  const sequence = useRef(0);
  // A nota de falha ao salvar segue só a gravação mais recente: uma leitura que chega no meio
  // não pode apagar nem manter essa nota, senão uma gravação bem-sucedida fica com a nota travada.
  const saveSequence = useRef(0);
  const refreshRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const bridge = window.hibiDesktop;
    const list = bridge?.listNotchDisplays;
    if (!list) return undefined;
    let active = true;
    const refresh = () => {
      const request = ++sequence.current;
      void list().then((next) => {
        if (!active || request !== sequence.current) return;
        setState(next);
        setLoadFailed(false);
      }).catch(() => { if (active && request === sequence.current) setLoadFailed(true); });
    };
    refreshRef.current = refresh;
    refresh();
    const unsubscribe = bridge.onNotchDisplaysChanged?.(refresh) ?? (() => undefined);
    return () => { active = false; unsubscribe(); };
  }, []);

  // Sem nenhuma leitura boa ainda, a linha ficaria travada até um monitor mudar; voltar à janela tenta de novo.
  useEffect(() => {
    if (!loadFailed || state) return undefined;
    const retry = () => refreshRef.current();
    window.addEventListener('focus', retry);
    return () => window.removeEventListener('focus', retry);
  }, [loadFailed, state]);

  if (!available) return <><TintSettings onEvent={onEvent} /><Row title={t('settings.notch.title')} detail={t('settings.notch.detail')}><span className="setting-value">{t('settings.notch.desktopOnly')}</span></Row></>;

  const choose = async (value: string) => {
    const setDisplay = window.hibiDesktop?.setNotchDisplay;
    if (!setDisplay) return;
    const request = ++sequence.current;
    const saveRequest = ++saveSequence.current;
    try {
      const next = await setDisplay(value === AUTO_NOTCH_VALUE ? null : Number(value));
      // A preferência foi salva independentemente do que o estado exibido mostra agora.
      onEvent('edit', 'Notch display', value);
      if (saveRequest === saveSequence.current) setSaveFailed(false);
      if (request !== sequence.current) return;
      setState(next);
      setLoadFailed(false);
    } catch { if (saveRequest === saveSequence.current) setSaveFailed(true); }
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
    <TintSettings onEvent={onEvent} />
    <Row title={t('settings.notch.title')} detail={t('settings.notch.detail')} note={rowNote} noteId={rowNote ? NOTE_ID : undefined}>
      {/* Travado durante o teste: o resultado precisa nomear o monitor que foi testado. */}
      <select aria-label={t('settings.notch.title')} aria-describedby={rowNote ? NOTE_ID : undefined} disabled={!state || testing} value={state ? selectedNotchValue(state) : AUTO_NOTCH_VALUE} onChange={(event) => void choose(event.target.value)}>
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

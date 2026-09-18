import React, { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/LocaleProvider';
import type { TabyBarContent } from './taby-bar-content';
import './taby-bar.css';

type Bridge = NonNullable<Window['hibiBar']>;

const Icon = ({ name }: { name: 'mic' | 'send' | 'stop' | 'close' }) => {
  const paths = {
    mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></>,
    send: <path d="M9 7l-4 4 4 4M5 11h10a4 4 0 0 0 4-4V5" />,
    stop: <rect x="7" y="7" width="10" height="10" rx="2" />,
    close: <path d="M7 7l10 10M17 7L7 17" />,
  } as const;
  return <svg viewBox="0 0 24 24" width="16" height="16" fill={name === 'stop' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
};

/**
 * A barra do Taby, embaixo do notch. No notch só o mascote; aqui fica o texto, e os botões mudam
 * conforme o pedido anda: digitar (falar ou enviar), ouvindo (parar), pensando, resposta, confirmação.
 */
export function TabyBar({ bridge = typeof window === 'undefined' ? undefined : window.hibiBar, initialContent = null }: { bridge?: Bridge; initialContent?: TabyBarContent | null }) {
  const t = useT();
  const [content, setContent] = useState<TabyBarContent | null>(initialContent);
  const [draft, setDraft] = useState('');
  // O último pedido enviado fica à vista enquanto o Taby pensa: a barra não some entre um estado e outro.
  const [lastPrompt, setLastPrompt] = useState('');
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!bridge) return undefined;
    void bridge.current().then((current) => setContent((existing) => existing ?? current)).catch(() => undefined);
    return bridge.onContent(setContent);
  }, [bridge]);
  useEffect(() => {
    if (content?.mode === 'input') { setDraft(''); field.current?.focus(); }
    if (content?.mode === 'listening' && content.text) setLastPrompt(content.text);
  }, [content?.mode, content?.requestId, content?.text]);

  const submit = () => {
    const text = draft.trim();
    if (!text || !bridge) return;
    setLastPrompt(text);
    setDraft('');
    void bridge.submit(text);
  };
  const close = () => { void bridge?.close(); };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Com confirmação no ar, Esc é "Cancelar", nunca uma confirmação sem resposta.
      const cancel = content?.actions.find((action) => action.id === 'cancel');
      if (cancel && content) void bridge?.action(content.requestId, cancel.id); else close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [content, bridge]);

  if (!content) return <main className="taby-bar" data-mode="hidden" aria-label={t('bar.label')} />;
  const button = (label: string, icon: Parameters<typeof Icon>[0]['name'], onClick: () => void) => <button type="button" className="taby-bar-icon" aria-label={label} title={label} onClick={onClick}><Icon name={icon} /></button>;

  return <main className="taby-bar" data-mode={content.mode} aria-label={t('bar.label')} role={content.mode === 'confirmation' ? 'dialog' : undefined}>
    {content.mode === 'input' && <>
      <input ref={field} className="taby-bar-field" value={draft} placeholder={t('bar.placeholder')} aria-label={t('bar.placeholder')} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submit(); } }} />
      <div className="taby-bar-actions">{draft.trim() ? button(t('bar.send'), 'send', submit) : button(t('bar.speak'), 'mic', () => { void bridge?.voice('start'); })}</div>
    </>}
    {content.mode === 'listening' && <>
      <p className="taby-bar-text" aria-live="polite">{content.text || <span className="taby-bar-hint">{t('bar.listening')}</span>}</p>
      <div className="taby-bar-actions"><span className="taby-bar-pulse" aria-hidden="true" />{button(t('bar.stop'), 'stop', () => { void bridge?.voice('stop'); })}</div>
    </>}
    {content.mode === 'thinking' && <>
      <p className="taby-bar-text" aria-live="polite">{lastPrompt || content.text || <span className="taby-bar-hint">{t('bar.thinking')}</span>}</p>
      <div className="taby-bar-actions"><span className="taby-bar-dots" aria-label={t('bar.thinking')}><i /><i /><i /></span></div>
    </>}
    {(content.mode === 'reply' || content.mode === 'notice') && <>
      <p className="taby-bar-text taby-bar-reply" aria-live="polite">{content.text}</p>
      <div className="taby-bar-actions">{button(t('bar.close'), 'close', close)}</div>
    </>}
    {content.mode === 'confirmation' && <>
      <p className="taby-bar-text taby-bar-reply">{content.text}</p>
      <div className="taby-bar-actions">{content.actions.map((action, index) => <button type="button" key={action.id} autoFocus={index === 0} className={`taby-bar-pill ${action.id === 'confirm' ? 'is-primary' : ''}`} onClick={() => { void bridge?.action(content.requestId, action.id); }}>{action.label}</button>)}</div>
    </>}
  </main>;
}

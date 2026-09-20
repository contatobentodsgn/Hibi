import React, { useEffect, useState } from 'react';
import { useT } from '../i18n/LocaleProvider';
import { SHORTCUT_CHOICES, shortcutLabel, shortcutStatusKey, type ShortcutStatus } from './shortcut-format';

type ShortcutState = { accelerator: string | null; status: ShortcutStatus; error?: 'invalid' };
type VoiceMode = 'off' | 'window' | 'notch';
type VoiceState = { shortcutVoice: VoiceMode; spokenReplies: boolean };
const VOICE_MODES: readonly VoiceMode[] = ['off', 'window', 'notch'];

/**
 * O atalho global do Taby, em Configurações › Geral.
 *
 * A escolha é uma lista, não uma captura de teclas: o que o Electron aceita registrar é um conjunto
 * pequeno, e uma captura livre convida a combinações que o sistema recusa — a pessoa apertaria a
 * tecla e não entenderia por que nada acontece.
 */
export function ShortcutSettings({ onEvent }: { onEvent: (action: string, detail: string, result?: string) => void }) {
  const t = useT();
  const bridge = typeof window === 'undefined' ? undefined : window.hibiDesktop;
  const [state, setState] = useState<ShortcutState | null>(null);
  const [voice, setVoice] = useState<VoiceState | null>(null);

  useEffect(() => {
    if (!bridge?.getTabyShortcut) return () => undefined;
    let active = true;
    void bridge.getTabyShortcut().then((value) => { if (active) setState(value); }).catch(() => undefined);
    void bridge.getVoiceSettings?.().then((value) => { if (active) setVoice(value); }).catch(() => undefined);
    return () => { active = false; };
  }, [bridge]);

  if (!bridge?.getTabyShortcut) {
    return <div className="setting-row"><div><strong>{t('shortcut.title')}</strong><span>{t('shortcut.desktopOnly')}</span></div></div>;
  }

  const escolher = async (value: string) => {
    const next = await bridge.setTabyShortcut?.(value === 'off' ? null : value).catch(() => null);
    if (!next) return;
    setState(next);
    onEvent('edit', t('shortcut.title'), next.status === 'active' ? 'pass' : 'fail');
  };

  const salvarVoz = async (patch: Partial<VoiceState>) => {
    const next = await bridge.setVoiceSettings?.(patch).catch(() => null);
    if (!next || next.error) return;
    setVoice({ shortcutVoice: next.shortcutVoice, spokenReplies: next.spokenReplies });
    onEvent('edit', t('shortcut.voice.title'), 'pass');
  };

  const spaceLabel = t('shortcut.space');
  return <><div className="setting-row">
    <div>
      <strong>{t('shortcut.title')}</strong>
      <span>{t('shortcut.detail')}</span>
      {state && <span>{t(shortcutStatusKey(state.status))}</span>}
    </div>
    <select aria-label={t('shortcut.title')} value={state?.accelerator ?? 'off'} onChange={(event) => void escolher(event.target.value)}>
      {SHORTCUT_CHOICES.map((choice) => <option key={choice} value={choice}>{shortcutLabel(choice, spaceLabel)}</option>)}
      <option value="off">{t('shortcut.off')}</option>
    </select>
  </div>
  {voice && <div className="setting-row">
    <div>
      <strong>{t('shortcut.voice.title')}</strong>
      <span>{t('shortcut.voice.detail')}</span>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}><input type="checkbox" checked={voice.spokenReplies} onChange={(event) => void salvarVoz({ spokenReplies: event.target.checked })} />{t('shortcut.voice.replies')}</label>
    </div>
    <select aria-label={t('shortcut.voice.title')} value={voice.shortcutVoice} onChange={(event) => void salvarVoz({ shortcutVoice: event.target.value as VoiceMode })}>
      {VOICE_MODES.map((mode) => <option key={mode} value={mode}>{t(`shortcut.voice.${mode}`)}</option>)}
    </select>
  </div>}</>;
}

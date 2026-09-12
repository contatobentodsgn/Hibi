import React from 'react';
import { useT } from '../i18n/LocaleProvider';
import { useThemePreference } from './theme-context';
import type { TintPreference } from './theme';
import './tint-settings.css';

const TINTS: readonly TintPreference[] = ['aurora', 'ocean', 'moss', 'iris', 'rose'];

export function TintSettings({ onEvent }: { onEvent: (action: string, detail: string, result?: string) => void }) {
  const { tint, setTint } = useThemePreference();
  const t = useT();
  return <div className="tint-settings">
    <div className="tint-copy"><strong>{t('tint.title')}</strong><span>{t('tint.detail')}</span></div>
    <div className="tint-options" role="radiogroup" aria-label={t('tint.title')}>
      {TINTS.map((option) => <button key={option} className="tint-option" role="radio" aria-checked={tint === option} aria-label={t(`tint.${option}`)} onClick={() => { setTint(option); onEvent('edit', 'Tint', option); }}>
        <span className={`tint-swatch tint-swatch-${option}`} aria-hidden="true" />
        <span>{t(`tint.${option}`)}</span>
      </button>)}
    </div>
  </div>;
}

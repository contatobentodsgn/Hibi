import React from 'react';
import { useT } from '../i18n/LocaleProvider';
import { useThemePreference } from './theme-context';
import type { TintPreference } from './theme';
import './tint-settings.css';

// Os quatro tons do preview aprovado ("Um toque de cor") e os ajustes de Aparência dele.
const TINTS: readonly TintPreference[] = ['lavender', 'blue', 'mint', 'peach'];

export function TintSettings({ onEvent }: { onEvent: (action: string, detail: string, result?: string) => void }) {
  const { tint, setTint, contrast, setContrast, motion, setMotion } = useThemePreference();
  const t = useT();
  const moreContrast = contrast === 'more';
  const reduceMotion = motion === 'reduce';
  return <div className="tint-settings">
    <div className="tint-copy"><strong>{t('tint.title')}</strong><span>{t('tint.detail')}</span></div>
    <div className="tint-options" role="radiogroup" aria-label={t('tint.title')}>
      {TINTS.map((option) => <button key={option} className="tint-option" role="radio" aria-checked={tint === option} aria-label={t(`tint.${option}`)} onClick={() => { setTint(option); onEvent('edit', 'Tint', option); }}>
        <span className={`tint-swatch tint-swatch-${option}`} aria-hidden="true" />
        <span>{t(`tint.${option}`)}</span>
      </button>)}
    </div>
    <button className="tint-toggle" role="switch" aria-checked={moreContrast} onClick={() => { setContrast(moreContrast ? 'normal' : 'more'); onEvent('edit', 'Contrast', moreContrast ? 'normal' : 'more'); }}>
      <span className="tint-copy"><strong>{t('tint.contrast')}</strong><span>{t('tint.contrastDetail')}</span></span>
    </button>
    <button className="tint-toggle" role="switch" aria-checked={reduceMotion} onClick={() => { setMotion(reduceMotion ? 'system' : 'reduce'); onEvent('edit', 'Motion', reduceMotion ? 'system' : 'reduce'); }}>
      <span className="tint-copy"><strong>{t('tint.motion')}</strong><span>{t('tint.motionDetail')}</span></span>
    </button>
  </div>;
}

import React from 'react';
import type { AwayBehavior } from './focus-settings';
import { useT } from '../i18n/LocaleProvider';
import './focus-atelier.css';

export function FocusAtelierSummary({ onBreak, running, completedToday, awayBehavior }: Readonly<{ onBreak: boolean; running: boolean; completedToday: number; awayBehavior: AwayBehavior }>) {
  const t = useT();
  const presence = awayBehavior === 'ask' ? t('focus.presence.askShort') : awayBehavior === 'pause' ? t('focus.presence.pauseShort') : t('focus.presence.keepShort');
  return <section className="focus-atelier-summary" aria-label={t('focus.summary.aria')}>
    <div><span>{t('focus.summary.session')}</span><strong>{onBreak ? t('focus.summary.recovery') : running ? t('focus.summary.progress') : t('focus.summary.ready')}</strong></div>
    <div><span>{t('focus.summary.sessionsToday')}</span><strong>{completedToday}</strong></div>
    <div><span>{t('focus.summary.presence')}</span><strong>{presence}</strong></div>
  </section>;
}

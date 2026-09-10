import React, { useEffect, useState } from 'react';
import { useT } from '../i18n/LocaleProvider';
import { CompanionAnimation } from './CompanionAnimation';

export type FocusMode = 'focus' | 'break';
type Props = { onEvent: (action: string, detail: string, result?: string) => void; onFocusStarted?: () => void; onFocusCompleted?: () => void; mode?: FocusMode; onModeChange?: (mode: FocusMode) => void };

// Foco e pausa usam o mesmo relógio, mas nunca os mesmos eventos: uma pausa concluída não pode contar
// como sessão de foco — o /stats soma sessões e minutos a partir de focus.*.
const DURATIONS: Record<FocusMode, readonly number[]> = { focus: [25], break: [5, 10, 15] };

export function FocusView({ onEvent, onFocusStarted, onFocusCompleted, mode = 'focus', onModeChange }: Props) {
  const t = useT();
  const onBreak = mode === 'break';
  const initial = DURATIONS[mode][0]!;
  const [running, setRunning] = useState(false);
  const [duration, setDuration] = useState(initial);
  const [seconds, setSeconds] = useState(initial * 60);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setSeconds((value) => {
      if (value > 1) return value - 1;
      setRunning(false);
      if (onBreak) onEvent('break-complete', 'Completed break', 'pass');
      else { onFocusCompleted?.(); onEvent('focus-complete', 'Completed focus session', 'pass'); }
      return duration * 60;
    }), 1000);
    return () => window.clearInterval(id);
  }, [running, onEvent, onFocusCompleted, duration, onBreak]);
  const chooseDuration = (minutes: number) => { if (running) return; setDuration(minutes); setSeconds(minutes * 60); onEvent(onBreak ? 'break-duration' : 'focus-duration', `${minutes} minute ${onBreak ? 'break' : 'session'}`, 'pass'); };
  const toggle = () => {
    const starting = !running;
    setRunning(starting);
    if (onBreak) { onEvent(starting ? 'break-start' : 'break-stop', starting ? 'Started break' : 'Stopped break', 'pass'); return; }
    if (starting) onFocusStarted?.();
    onEvent(starting ? 'focus-start' : 'focus-stop', starting ? 'Started Post 1 focus' : 'Stopped focus session', 'pass');
  };
  const time = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const heading = onBreak ? (running ? t('focus.breakTitle') : t('focus.breakReady')) : (running ? 'Post 1 — Kabrito digital' : 'Ready to focus.');
  const subhead = onBreak ? (running ? t('focus.breakRunning') : `${duration} ${t('focus.breakOnClock')}`) : (running ? 'One clear block. No back-to-back nudges.' : `Pick a task — ${duration}m on the clock.`);
  const action = onBreak ? (running ? t('focus.stopBreak') : t('focus.startBreak')) : (running ? 'Pause session' : 'Start focus');
  return <div className="focus-view"><div className="eyebrow">{onBreak ? t('focus.breakEyebrow') : 'FOCUS MODE · LOCAL SESSION'}</div><CompanionAnimation state={running && !onBreak ? 'working' : 'idle'} label={onBreak ? t('focus.breakCompanion') : 'Focus companion'} /><div className={`focus-ring ${running ? 'is-running' : ''}`}><span>{time}</span><small>MINUTES</small></div><h1>{heading}</h1><p className="subhead">{subhead}</p><button className="primary focus-button" onClick={toggle}>{action}</button><div className="focus-options">{DURATIONS[mode].map((minutes) => <button key={minutes} className={`filter ${duration === minutes ? 'active' : ''}`} aria-pressed={duration === minutes} disabled={running} onClick={() => chooseDuration(minutes)}>{onBreak ? `${minutes}m` : `${minutes}m focus`}</button>)}<button className="outline" disabled={running} onClick={() => onModeChange?.(onBreak ? 'focus' : 'break')}>{onBreak ? t('focus.backToFocus') : t('focus.takeBreak')}</button></div><p className="muted">Reminders are quiet during focus unless marked Important.</p></div>;
}

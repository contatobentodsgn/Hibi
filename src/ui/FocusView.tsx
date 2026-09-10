import React, { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/LocaleProvider';
import { CompanionAnimation } from './CompanionAnimation';
import { IDLE_FOCUS_LIFECYCLE, stepFocusLifecycle, type FocusLifecycleAction, type FocusLifecycleEvent } from './focus-lifecycle';

export type FocusMode = 'focus' | 'break';
type Props = { onEvent: (action: string, detail: string, result?: string) => void; onFocusStarted?: () => void; onFocusCompleted?: () => void; onFocusLifecycle?: (event: FocusLifecycleEvent) => void; mode?: FocusMode; onModeChange?: (mode: FocusMode) => void };

// Foco e pausa usam o mesmo relógio, mas nunca os mesmos eventos: uma pausa concluída não pode contar
// como sessão de foco — o /stats soma sessões e minutos a partir de focus.*.
const DURATIONS: Record<FocusMode, readonly number[]> = { focus: [25], break: [5, 10, 15] };

export function FocusView({ onEvent, onFocusStarted, onFocusCompleted, onFocusLifecycle, mode = 'focus', onModeChange }: Props) {
  const t = useT();
  const onBreak = mode === 'break';
  const initial = DURATIONS[mode][0]!;
  const [running, setRunning] = useState(false);
  const [duration, setDuration] = useState(initial);
  const [seconds, setSeconds] = useState(initial * 60);
  // Refs, não estado: o cancelamento sai de um cleanup, que só enxerga valores da renderização em que foi criado.
  const lifecycle = useRef(IDLE_FOCUS_LIFECYCLE);
  const onFocusLifecycleRef = useRef(onFocusLifecycle);
  useEffect(() => { onFocusLifecycleRef.current = onFocusLifecycle; });
  const emitLifecycle = (action: FocusLifecycleAction) => {
    const step = stepFocusLifecycle(mode, action, lifecycle.current, Date.now());
    lifecycle.current = step.state;
    if (step.event) onFocusLifecycleRef.current?.(step.event);
  };
  // Sair da tela ou trocar de modo abandona a sessão iniciada. No mount/unmount extra do StrictMode
  // nada foi iniciado ainda, então não há evento.
  useEffect(() => () => emitLifecycle('abandon'), [mode]);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  // Conclusão fora do updater: updaters precisam ser puros (o StrictMode os chama duas vezes), e cada
  // conclusão precisa virar exatamente um evento — o /stats conta sessões a partir deles.
  useEffect(() => {
    if (!running || seconds > 0) return;
    setRunning(false);
    setSeconds(duration * 60);
    if (onBreak) onEvent('break-complete', 'Completed break', 'pass');
    else { emitLifecycle('complete'); onFocusCompleted?.(); onEvent('focus-complete', 'Completed focus session', 'pass'); }
  }, [running, seconds, duration, onBreak, onEvent, onFocusCompleted]);
  // Escolher a duração com a sessão pausada zera o relógio: a sessão anterior foi abandonada.
  const chooseDuration = (minutes: number) => { if (running) return; emitLifecycle('abandon'); setDuration(minutes); setSeconds(minutes * 60); onEvent(onBreak ? 'break-duration' : 'focus-duration', `${minutes} minute ${onBreak ? 'break' : 'session'}`, 'pass'); };
  const toggle = () => {
    const starting = !running;
    setRunning(starting);
    if (onBreak) { onEvent(starting ? 'break-start' : 'break-stop', starting ? 'Started break' : 'Stopped break', 'pass'); return; }
    if (starting) onFocusStarted?.();
    emitLifecycle(starting ? 'start' : 'pause');
    onEvent(starting ? 'focus-start' : 'focus-stop', starting ? 'Started Post 1 focus' : 'Stopped focus session', 'pass');
  };
  const time = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const heading = onBreak ? (running ? t('focus.breakTitle') : t('focus.breakReady')) : (running ? 'Post 1 — Kabrito digital' : 'Ready to focus.');
  const subhead = onBreak ? (running ? t('focus.breakRunning') : `${duration} ${t('focus.breakOnClock')}`) : (running ? 'One clear block. No back-to-back nudges.' : `Pick a task — ${duration}m on the clock.`);
  const action = onBreak ? (running ? t('focus.stopBreak') : t('focus.startBreak')) : (running ? 'Pause session' : 'Start focus');
  return <div className="focus-view"><div className="eyebrow">{onBreak ? t('focus.breakEyebrow') : 'FOCUS MODE · LOCAL SESSION'}</div><CompanionAnimation state={running && !onBreak ? 'working' : 'idle'} label={onBreak ? t('focus.breakCompanion') : 'Focus companion'} /><div className={`focus-ring ${running ? 'is-running' : ''}`}><span>{time}</span><small>{t('focus.minutes')}</small></div><h1>{heading}</h1><p className="subhead">{subhead}</p><button className="primary focus-button" onClick={toggle}>{action}</button><div className="focus-options">{DURATIONS[mode].map((minutes) => <button key={minutes} className={`filter ${duration === minutes ? 'active' : ''}`} aria-pressed={DURATIONS[mode].length > 1 ? duration === minutes : undefined} disabled={running} onClick={() => chooseDuration(minutes)}>{onBreak ? `${minutes}m` : `${minutes}m focus`}</button>)}<button className="outline" disabled={running} onClick={() => onModeChange?.(onBreak ? 'focus' : 'break')}>{onBreak ? t('focus.backToFocus') : t('focus.takeBreak')}</button></div>{!onBreak && <p className="muted">Reminders are quiet during focus unless marked Important.</p>}</div>;
}

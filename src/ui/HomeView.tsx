import React from 'react';
import { localNoon, todayKey } from '../domain/date-context';
import type { StudyData } from '../domain/models';
import { CompanionAnimation } from './CompanionAnimation';
import { deriveDayRhythm, formatMinutes, formatWindow } from './day-rhythm';
import './home-atelier.css';

type Props = { data: StudyData; onEvent: (action: string, detail: string, result?: string) => void; onNavigate: (route: any) => void; onOpenCommands?: () => void };

export function HomeView({ data, onEvent, onNavigate, onOpenCommands }: Props) {
  const today = todayKey();
  const wallClock = new Date().toTimeString().slice(0, 5);
  const rhythm = deriveDayRhythm(data.blocks, today, wallClock);
  const current = rhythm.now;
  const next = data.blocks.filter((block) => block.start.startsWith(today) && block.category !== 'break' && block.id !== current?.id && (!current || block.start > current.start)).slice(0, 3);
  const planned = rhythm.workCount;
  const label = localNoon(today).toLocaleDateString('en-US', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase().replace(',', ' ·');
  return <div className="home-view">
    <div className="eyebrow">{label} <span className="pill green">LOCAL STUDY MODE</span></div>
    <section className="hero"><div><p className="kicker">YOUR DAY, IN ONE PLACE</p><h1>Make room for<br /><em>what matters.</em></h1><p className="subhead">A calm command centre for tasks, time and attention.</p></div><div className="hero-orbit"><span>{formatMinutes(rhythm.plannedMinutes)}</span><small>PLANNED TODAY</small></div></section>
    <div className="home-grid"><section className="panel now-panel today-now"><div><div className="panel-head"><span>NOW</span><span>{current ? current.start.slice(11, 16) : 'OPEN'}</span></div><h2>{current?.title ?? 'No block scheduled'}</h2><p>{current ? `${formatMinutes(current.minutes)} · ${current.category}` : 'Your day is clear.'}</p><button className="primary today-action" onClick={() => onNavigate(current ? 'focus' : 'day')}>{current ? 'Start focus' : 'Open agenda'}</button></div><CompanionAnimation state={current ? 'working' : 'idle'} label="Today companion" /></section>
      <section className="panel health-panel"><div className="panel-head"><span>PLAN HEALTH</span><span className="pill amber">{Math.max(0, data.tasks.length - planned)} REVIEW</span></div><div className="health-stat"><strong>{planned} / {data.tasks.length}</strong><span>work blocks placed today</span></div><div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={Math.max(1, data.tasks.length)} aria-valuenow={planned} aria-valuetext={`${planned} of ${data.tasks.length} planned today`}><span style={{ width: `${Math.min(100, planned / Math.max(1, data.tasks.length) * 100)}%` }} /></div><small>{planned} work blocks planned today</small><button className="text-button" onClick={() => { onEvent('validation', 'Reviewed daily plan', 'needs-review'); onNavigate('week'); }}>Review daily plan →</button></section>
      <section className="panel next-panel"><div className="panel-head"><span>UP NEXT</span><span className="muted">TODAY</span></div>{next.map((block) => <div className="next-row" key={block.id}><b>{block.start.slice(11, 16)}</b><span className={block.category === 'break' ? 'break-label' : undefined}>{block.title}</span></div>)}<div className="free-window"><span>Next free window</span><strong>{formatWindow(rhythm.freeWindows[0])}</strong></div></section>
    </div>
    <button className="quick-input" aria-label="Open quick capture" onClick={() => { onEvent('command', 'Opened quick capture'); onOpenCommands?.(); }}><span>+</span><span>What needs your attention?</span><kbd>/</kbd></button>
  </div>;
}

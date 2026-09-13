import React from 'react';
import type { AwayBehavior } from './focus-settings';
import './focus-atelier.css';

export function FocusAtelierSummary({ onBreak, running, completedToday, awayBehavior }: Readonly<{ onBreak: boolean; running: boolean; completedToday: number; awayBehavior: AwayBehavior }>) {
  const presence = awayBehavior === 'ask' ? 'Ask when away' : awayBehavior === 'pause' ? 'Pause when away' : 'Keep counting';
  return <section className="focus-atelier-summary" aria-label="Focus session summary">
    <div><span>Session</span><strong>{onBreak ? 'Recovery break' : running ? 'In progress' : 'Ready to begin'}</strong></div>
    <div><span>Sessions today</span><strong>{completedToday}</strong></div>
    <div><span>Presence</span><strong>{presence}</strong></div>
  </section>;
}

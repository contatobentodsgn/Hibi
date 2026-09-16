import React from 'react';
import type { Habit } from '../domain/models';
import { deriveHabitsRhythm } from './progress-rhythm';
import './progress-atelier.css';

export function HabitsAtelierSummary({ habits, today }: Readonly<{ habits: readonly Habit[]; today: string }>) {
  const rhythm = deriveHabitsRhythm(habits, today);
  return <section className="progress-atelier-summary" aria-label="Habits rhythm summary">
    <div><span>Completed today</span><strong>{rhythm.completedToday} of {rhythm.total}</strong></div>
    <div><span>Longest streak</span><strong>{rhythm.longestStreak} days</strong></div>
    <div><span>Still to do</span><strong>{rhythm.pending}</strong></div>
  </section>;
}

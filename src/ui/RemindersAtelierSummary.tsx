import React from 'react';
import type { Reminder } from '../domain/models';
import { deriveReminderRhythm } from './reminder-rhythm';
import './reminders-atelier.css';

export function RemindersAtelierSummary({ reminders, now = new Date() }: Readonly<{ reminders: readonly Reminder[]; now?: Date }>) {
  const rhythm = deriveReminderRhythm(reminders, now);
  return <section className="reminders-atelier-summary" aria-label="Reminder attention summary">
    <div className="reminder-next"><span>Next alert</span><strong>{rhythm.next?.title ?? 'No active alert queued'}</strong></div>
    <div><span>Overdue</span><strong>{rhythm.overdue}</strong></div>
    <div><span>Paused</span><strong>{rhythm.paused}</strong></div>
  </section>;
}

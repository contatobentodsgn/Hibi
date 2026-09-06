import React from 'react';
import type { EntityStatus, Reminder, StudyData } from '../domain/models';

type Props = {
  data: StudyData;
  onEvent: (action: string, detail: string, result?: string) => void;
  onReminderStatusChange: (id: string, status: EntityStatus) => void;
  onCreateReminder?: (title: string) => void;
};

const weekdayLabels: Record<number, string> = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };

function reminderDetail(reminder: Reminder): string {
  const recurrence = reminder.schedule.recurrence;
  if (!recurrence) return `${reminder.schedule.at.slice(11, 16)} · one-time`;
  if (recurrence.frequency === 'daily') return `Every day · ${recurrence.time ?? reminder.schedule.at.slice(11, 16)}`;
  return (recurrence.weekdays ?? []).map((day) => `${weekdayLabels[day]} ${recurrence.timesByWeekday?.[day] ?? recurrence.time ?? reminder.schedule.at.slice(11, 16)}`).join(' · ');
}

export function RemindersView({ data, onEvent, onReminderStatusChange, onCreateReminder }: Props) {
  const activeReminders = data.reminders.filter((reminder) => reminder.status !== 'paused');
  return <div className="view"><div className="view-heading"><div><p className="eyebrow">ATTENTION LAYER</p><h1>Reminders</h1><p className="muted">{activeReminders.length} active · grouped by priority</p></div><button className="primary" onClick={() => { const title = window.prompt('Nome do lembrete'); if (title?.trim()) onCreateReminder?.(title.trim()); }}>+ New reminder</button></div>
  {activeReminders.length > 1 && <div className="notice"><span className="notice-icon">!</span><div><strong>Two repeating reminders are close together.</strong><p>Review the schedule before spacing them out. Important reminders stay fixed.</p></div><button className="outline" onClick={() => onEvent('validation', 'Reminder spacing review', 'needs-review')}>Review spacing</button></div>}
  <div className="filter-row"><button className="filter active">All {data.reminders.length}</button><button className="filter">Important {data.reminders.filter((reminder) => reminder.category === 'important').length}</button><button className="filter">Wellbeing {data.reminders.filter((reminder) => reminder.category === 'wellbeing').length}</button></div><section className="list-card">{data.reminders.map((reminder) => {
    const paused = reminder.status === 'paused';
    const tone = reminder.category === 'important' ? 'orange' : 'green';
    const type = reminder.category === 'important' ? 'Important' : 'Wellbeing';
    return <div className="reminder-row" key={reminder.id}><span className={`reminder-mark ${tone}`} /><div><strong>{reminder.title}</strong><span>{reminderDetail(reminder)}{paused ? ' · paused' : ''}</span></div><span className={`pill ${tone}`}>{type}</span><button className="icon-button" aria-label={`Edit ${reminder.title}`} onClick={() => onEvent('edit', reminder.title)}>✎</button><button className="icon-button" aria-label={`${paused ? 'Resume' : 'Pause'} ${reminder.title}`} onClick={() => { onReminderStatusChange(reminder.id, paused ? 'open' : 'paused'); onEvent(paused ? 'resume' : 'pause', reminder.title); }}>{paused ? '▶' : 'Ⅱ'}</button></div>;
  })}</section>
</div>;
}

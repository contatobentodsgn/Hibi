import React, { useState } from 'react';
import type { EntityStatus, Reminder, StudyData } from '../domain/models';

type Props = {
  data: StudyData;
  onEvent: (action: string, detail: string, result?: string) => void;
  onReminderStatusChange: (id: string, status: EntityStatus) => void;
  onCreateReminder?: (title: string) => void;
  onRenameReminder?: (id: string, title: string) => void;
  onDeleteReminder?: (id: string) => void;
  onEditReminderSchedule?: (id: string) => void;
};

const weekdayLabels: Record<number, string> = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };

function reminderDetail(reminder: Reminder): string {
  const recurrence = reminder.schedule.recurrence;
  if (!recurrence) return `${reminder.schedule.at.slice(11, 16)} · one-time`;
  if (recurrence.frequency === 'daily') return `Every day · ${recurrence.time ?? reminder.schedule.at.slice(11, 16)}`;
  return (recurrence.weekdays ?? []).map((day) => `${weekdayLabels[day]} ${recurrence.timesByWeekday?.[day] ?? recurrence.time ?? reminder.schedule.at.slice(11, 16)}`).join(' · ');
}

export function RemindersView({ data, onEvent, onReminderStatusChange, onCreateReminder, onRenameReminder, onDeleteReminder, onEditReminderSchedule }: Props) {
  const [filter, setFilter] = useState<'all' | 'important' | 'wellbeing'>('all');
  const activeReminders = data.reminders.filter((reminder) => reminder.status !== 'paused');
  const recurringTimes = activeReminders.flatMap((reminder) => { const recurrence = reminder.schedule.recurrence; if (!recurrence) return []; if (recurrence.frequency === 'daily') return [recurrence.time ?? reminder.schedule.at.slice(11, 16)]; return (recurrence.weekdays ?? []).map((day) => recurrence.timesByWeekday?.[day] ?? recurrence.time ?? reminder.schedule.at.slice(11, 16)); });
  const closeRepeatingReminders = recurringTimes.some((time, index) => recurringTimes.slice(index + 1).some((other) => { const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5)); return Math.abs(toMinutes(time) - toMinutes(other)) <= 60; }));
  const visibleReminders = data.reminders.filter((reminder) => filter === 'all' || reminder.category === filter);
  return <div className="view"><div className="view-heading"><div><p className="eyebrow">ATTENTION LAYER</p><h1>Reminders</h1><p className="muted">{activeReminders.length} active · grouped by priority</p></div><button className="primary" onClick={() => { const title = window.prompt('Nome do lembrete'); if (title?.trim()) onCreateReminder?.(title.trim()); }}>+ New reminder</button></div>
  {closeRepeatingReminders && <div className="notice"><span className="notice-icon">!</span><div><strong>Two repeating reminders are close together.</strong><p>Review the schedule before spacing them out. Important reminders stay fixed.</p></div><button className="outline" onClick={() => onEvent('validation', 'Reminder spacing review', 'needs-review')}>Review spacing</button></div>}
  <div className="filter-row">{([['all', `All ${data.reminders.length}`], ['important', `Important ${data.reminders.filter((reminder) => reminder.category === 'important').length}`], ['wellbeing', `Wellbeing ${data.reminders.filter((reminder) => reminder.category === 'wellbeing').length}`]] as const).map(([value, label]) => <button key={value} className={`filter ${filter === value ? 'active' : ''}`} onClick={() => { setFilter(value); onEvent('filter', `Reminders · ${label}`); }}>{label}</button>)}</div><section className="list-card">{visibleReminders.map((reminder) => {
    const paused = reminder.status === 'paused';
    const tone = reminder.category === 'important' ? 'orange' : 'green';
    const type = reminder.category === 'important' ? 'Important' : 'Wellbeing';
    return <div className="reminder-row" key={reminder.id}><span className={`reminder-mark ${tone}`} /><div><strong>{reminder.title}</strong><span>{reminderDetail(reminder)}{paused ? ' · paused' : ''}</span></div><span className={`pill ${tone}`}>{type}</span><button className="icon-button" aria-label={`Edit ${reminder.title}`} onClick={() => { const title = window.prompt('Novo nome do lembrete', reminder.title); if (title?.trim() && title.trim() !== reminder.title) onRenameReminder?.(reminder.id, title.trim()); onEditReminderSchedule?.(reminder.id); }}>✎</button><button className="icon-button" aria-label="Delete reminder" onClick={() => { if (window.confirm(`Excluir ${reminder.title}?`)) onDeleteReminder?.(reminder.id); }}>×</button><button className="icon-button" aria-label={`${paused ? 'Resume' : 'Pause'} ${reminder.title}`} onClick={() => { onReminderStatusChange(reminder.id, paused ? 'open' : 'paused'); onEvent(paused ? 'resume' : 'pause', reminder.title); }}>{paused ? '▶' : 'Ⅱ'}</button></div>;
  })}{!visibleReminders.length && <p className="empty">No reminders match this filter.</p>}</section>
</div>;
}

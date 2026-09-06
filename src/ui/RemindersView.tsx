import React, { useState } from 'react';
import type { EntityStatus, Reminder, StudyData } from '../domain/models';

type Props = {
  data: StudyData;
  onEvent: (action: string, detail: string, result?: string) => void;
  onReminderStatusChange: (id: string, status: EntityStatus) => void;
  onCreateReminder?: (title: string) => void;
  onRenameReminder?: (id: string, title: string) => void;
  onDeleteReminder?: (id: string) => void;
  onEditReminderSchedule?: (id: string, schedule: EditedReminderSchedule) => void;
};

export type EditedReminderSchedule = {
  date: string;
  frequency: 'one-time' | 'daily' | 'weekly';
  time: string;
  weekdays: number[];
};

const weekdayLabels: Record<number, string> = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };
const weekdayOptions = [0, 1, 2, 3, 4, 5, 6];

function reminderDetail(reminder: Reminder): string {
  const recurrence = reminder.schedule.recurrence;
  if (!recurrence) return `${reminder.schedule.at.slice(11, 16)} · one-time`;
  if (recurrence.frequency === 'daily') return `Every day · ${recurrence.time ?? reminder.schedule.at.slice(11, 16)}`;
  return (recurrence.weekdays ?? []).map((day) => `${weekdayLabels[day]} ${recurrence.timesByWeekday?.[day] ?? recurrence.time ?? reminder.schedule.at.slice(11, 16)}`).join(' · ');
}

function initialSchedule(reminder: Reminder) {
  const recurrence = reminder.schedule.recurrence;
  return { date: reminder.schedule.at.slice(0, 10), frequency: recurrence?.frequency ?? 'one-time', time: recurrence?.time ?? reminder.schedule.at.slice(11, 16), weekdays: recurrence?.weekdays?.length ? recurrence.weekdays : [new Date(`${reminder.schedule.at.slice(0, 10)}T12:00:00`).getDay()] } as const;
}

export function RemindersView({ data, onEvent, onReminderStatusChange, onCreateReminder, onRenameReminder, onDeleteReminder, onEditReminderSchedule }: Props) {
  const [filter, setFilter] = useState<'all' | 'important' | 'wellbeing'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [schedule, setSchedule] = useState<EditedReminderSchedule>({ date: '', frequency: 'one-time', time: '09:00', weekdays: [1] });
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);
  const activeReminders = data.reminders.filter((reminder) => reminder.status !== 'paused');
  const recurringTimes = activeReminders.flatMap((reminder) => { const recurrence = reminder.schedule.recurrence; if (!recurrence) return []; if (recurrence.frequency === 'daily') return [recurrence.time ?? reminder.schedule.at.slice(11, 16)]; return (recurrence.weekdays ?? []).map((day) => recurrence.timesByWeekday?.[day] ?? recurrence.time ?? reminder.schedule.at.slice(11, 16)); });
  const closeRepeatingReminders = recurringTimes.some((time, index) => recurringTimes.slice(index + 1).some((other) => { const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5)); return Math.abs(toMinutes(time) - toMinutes(other)) <= 60; }));
  const visibleReminders = data.reminders.filter((reminder) => filter === 'all' || reminder.category === filter);
  const beginEdit = (reminder: Reminder) => { setEditingId(reminder.id); setDraftTitle(reminder.title); setSchedule(initialSchedule(reminder)); };
  const saveEdit = (reminder: Reminder) => { const title = draftTitle.trim(); if (!title) return; if (title !== reminder.title) onRenameReminder?.(reminder.id, title); onEditReminderSchedule?.(reminder.id, schedule); onEvent('edit', reminder.title, 'schedule-save-requested'); setEditingId(null); };
  return <div className="view"><div className="view-heading"><div><p className="eyebrow">ATTENTION LAYER</p><h1>Reminders</h1><p className="muted">{activeReminders.length} active · grouped by priority</p></div><button type="button" className="primary" aria-haspopup="dialog" aria-controls="reminder-create-title" onClick={() => onCreateReminder?.('')}>+ New reminder</button></div>
  {closeRepeatingReminders && <div className="notice"><span className="notice-icon">!</span><div><strong>Two repeating reminders are close together.</strong><p>Review the schedule before spacing them out. Important reminders stay fixed.</p></div><button className="outline" onClick={() => onEvent('validation', 'Reminder spacing review', 'needs-review')}>Review spacing</button></div>}
  <div className="filter-row">{([['all', `All ${data.reminders.length}`], ['important', `Important ${data.reminders.filter((reminder) => reminder.category === 'important').length}`], ['wellbeing', `Wellbeing ${data.reminders.filter((reminder) => reminder.category === 'wellbeing').length}`]] as const).map(([value, label]) => <button key={value} className={`filter ${filter === value ? 'active' : ''}`} onClick={() => { setFilter(value); onEvent('filter', `Reminders · ${label}`); }}>{label}</button>)}</div><section className="list-card">{visibleReminders.map((reminder) => {
    const paused = reminder.status === 'paused';
    const tone = reminder.category === 'important' ? 'orange' : 'green';
    const type = reminder.category === 'important' ? 'Important' : 'Wellbeing';
    const isEditing = editingId === reminder.id;
    return <React.Fragment key={reminder.id}><div className="reminder-row"><span className={`reminder-mark ${tone}`} /><div><strong>{reminder.title}</strong><span>{reminderDetail(reminder)}{paused ? ' · paused' : ''}</span></div><span className={`pill ${tone}`}>{type}</span><button className="icon-button" aria-label={`Edit ${reminder.title}`} aria-expanded={isEditing} onClick={() => isEditing ? setEditingId(null) : beginEdit(reminder)}>✎</button><button className="icon-button" aria-label={`Delete ${reminder.title}`} onClick={() => setPendingDelete({ id: reminder.id, title: reminder.title })}>×</button><button className="icon-button" aria-label={`${paused ? 'Resume' : 'Pause'} ${reminder.title}`} onClick={() => { onReminderStatusChange(reminder.id, paused ? 'open' : 'paused'); onEvent(paused ? 'resume' : 'pause', reminder.title); }}>{paused ? '▶' : 'Ⅱ'}</button></div>{isEditing && <form className="panel" aria-label={`Edit ${reminder.title}`} onSubmit={(event) => { event.preventDefault(); saveEdit(reminder); }}><label>Reminder name<input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} autoFocus required /></label><fieldset><legend>Schedule</legend><label>Type<select value={schedule.frequency} onChange={(event) => setSchedule({ ...schedule, frequency: event.target.value as typeof schedule.frequency })}><option value="one-time">One-time</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>{schedule.frequency === 'one-time' && <label>Date<input type="date" value={schedule.date} onChange={(event) => setSchedule({ ...schedule, date: event.target.value })} /></label>}<label>Time<input type="time" value={schedule.time} onChange={(event) => setSchedule({ ...schedule, time: event.target.value })} required /></label>{schedule.frequency === 'weekly' && <div role="group" aria-label="Weekdays">{weekdayOptions.map((day) => <label key={day}><input type="checkbox" checked={schedule.weekdays.includes(day)} onChange={() => setSchedule({ ...schedule, weekdays: schedule.weekdays.includes(day) ? schedule.weekdays.filter((item) => item !== day) : [...schedule.weekdays, day].sort() })} /> {weekdayLabels[day]}</label>)}</div>}</fieldset><button type="submit" className="primary">Save</button><button type="button" className="outline" onClick={() => setEditingId(null)}>Cancel</button></form>}</React.Fragment>;
  })}{!visibleReminders.length && <p className="empty">No reminders match this filter.</p>}</section>{pendingDelete && <DeleteConfirmation title={pendingDelete.title} onCancel={() => setPendingDelete(null)} onConfirm={() => { onDeleteReminder?.(pendingDelete.id); setPendingDelete(null); }} />}
</div>;
}

function DeleteConfirmation({ title, onCancel, onConfirm }: { title: string; onCancel: () => void; onConfirm: () => void }) { return <div className="overlay"><section className="palette" role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title"><h2 id="delete-confirm-title">Delete {title}?</h2><p>This action cannot be undone.</p><button className="outline" type="button" onClick={onCancel} autoFocus>Cancel</button><button className="primary" type="button" onClick={onConfirm}>Confirm delete</button></section></div>; }

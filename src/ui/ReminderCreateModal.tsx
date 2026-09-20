import React, { useEffect, useRef, useState } from 'react';
import { localDateKey } from '../domain/date-context';
import { useT } from '../i18n/LocaleProvider';

const pad = (value: number) => String(value).padStart(2, '0');
/** Se a data e a hora de parede escolhidas já passaram no relógio local. */
export const isPastWallClock = (date: string, time: string, now: Date = new Date()): boolean => `${date}T${time}` <= `${localDateKey(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}`;

export type NewReminderForm = {
  title: string;
  category: 'important' | 'wellbeing';
  date: string;
  frequency: 'one-time' | 'daily' | 'weekly';
  time: string;
  weekdays: number[];
};

type Props = { defaultDate: string; onClose: () => void; onSubmit: (form: NewReminderForm) => void };
const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ReminderCreateModal({ defaultDate, onClose, onSubmit }: Props) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<NewReminderForm['category']>('important');
  const [date, setDate] = useState(defaultDate);
  const [frequency, setFrequency] = useState<NewReminderForm['frequency']>('one-time');
  const [time, setTime] = useState('09:00');
  const [pastError, setPastError] = useState(false);
  const t = useT();
  const [weekdays, setWeekdays] = useState<number[]>([new Date(`${defaultDate}T12:00:00`).getDay()]);

  useEffect(() => {
    titleRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !date || !time || (frequency === 'weekly' && !weekdays.length)) return;
    // Um lembrete único no passado seria gravado e nunca tocaria.
    if (frequency === 'one-time' && isPastWallClock(date, time)) { setPastError(true); return; }
    onSubmit({ title: title.trim(), category, date, frequency, time, weekdays });
  };

  return <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="palette" role="dialog" aria-modal="true" aria-labelledby="reminder-create-title">
      <form onSubmit={submit}>
        <div className="palette-search"><div><p className="eyebrow">REMINDERS / NEW</p><h2 id="reminder-create-title" style={{ margin: '5px 0 0', font: '500 28px Georgia, serif' }}>Create reminder</h2></div></div>
        <div style={{ display: 'grid', gap: 16, padding: '22px 20px' }}>
          <label style={{ display: 'grid', gap: 7 }}>Title<input ref={titleRef} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What should you remember?" required /></label>
          <fieldset><legend>Category</legend><div style={{ display: 'flex', gap: 16 }}>{(['important', 'wellbeing'] as const).map((value) => <label key={value}><input type="radio" name="reminder-category" value={value} checked={category === value} onChange={() => setCategory(value)} /> {value === 'important' ? 'Important' : 'Wellbeing'}</label>)}</div></fieldset>
          <fieldset><legend>Schedule</legend><div style={{ display: 'grid', gap: 12 }}>
            <label style={{ display: 'grid', gap: 7 }}>Type<select aria-label="Schedule type" value={frequency} onChange={(event) => setFrequency(event.target.value as NewReminderForm['frequency'])}><option value="one-time">One-time</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
            <label style={{ display: 'grid', gap: 7 }}>Date<input type="date" value={date} onChange={(event) => { setDate(event.target.value); setPastError(false); }} required /></label>
            <label style={{ display: 'grid', gap: 7 }}>Time<input type="time" value={time} onChange={(event) => { setTime(event.target.value); setPastError(false); }} required /></label>
            {frequency === 'weekly' && <div role="group" aria-label="Weekdays">{weekdayLabels.map((label, day) => <label key={label} style={{ marginRight: 10 }}><input type="checkbox" checked={weekdays.includes(day)} onChange={() => setWeekdays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort())} /> {label}</label>)}</div>}
          </div></fieldset>
          {pastError && frequency === 'one-time' && <p role="alert" className="form-error" style={{ margin: 0, color: '#984418' }}>{t('reminderForm.pastOneTime')}</p>}
        </div>
        <div className="palette-footer" style={{ justifyContent: 'flex-end', gap: 9 }}><button type="button" className="outline" onClick={onClose}>Cancel</button><button type="submit" className="primary">Create reminder</button></div>
      </form>
    </div>
  </div>;
}

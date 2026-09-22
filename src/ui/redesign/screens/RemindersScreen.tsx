import { useMemo, useState } from 'react';
import { Bell, CalendarClock, Pause, Play, Plus, Trash2 } from 'lucide-react';
import { Button, Card } from '@heroui/react';
import type { EntityStatus, Reminder, StudyData } from '../../../domain/models';
import { isPastWallClock } from '../../ReminderCreateModal';
import type { EditedReminderSchedule } from '../../RemindersView';
import { deriveReminderRhythm } from '../../reminder-rhythm';
import { ActionDialog } from '../components/ActionDialog';
import { HibiEmptyState } from '../components/HibiEmptyState';
import { HibiTag } from '../components/HibiTag';
import { HibiUiRoot } from '../components/HibiUiRoot';
import { SectionHeader } from '../components/SectionHeader';
import { useT } from '../../../i18n/LocaleProvider';
import type { DictionaryKey } from '../../../i18n/dictionary';
import './reminders-screen.css';
import './reminders-screen-edit.css';

type Props = Readonly<{
  data: StudyData;
  onEvent: (action: string, detail: string, result?: string) => void;
  onReminderStatusChange: (id: string, status: EntityStatus) => void;
  onCreateReminder?: () => void;
  onRenameReminder?: (id: string, title: string) => void;
  onDeleteReminder?: (id: string) => void;
  onEditReminderSchedule?: (id: string, schedule: EditedReminderSchedule) => void;
}>;

const weekdayKeys = [['reminders.weekday.sun', 0], ['reminders.weekday.mon', 1], ['reminders.weekday.tue', 2], ['reminders.weekday.wed', 3], ['reminders.weekday.thu', 4], ['reminders.weekday.fri', 5], ['reminders.weekday.sat', 6]] as const;

type Translator = (key: DictionaryKey) => string;

function scheduleText(reminder: Reminder, t?: Translator): string {
  const recurrence = reminder.schedule.recurrence;
  const time = recurrence?.time ?? reminder.schedule.at.slice(11, 16);
  if (!recurrence) return `${reminder.schedule.at.slice(8, 10)}/${reminder.schedule.at.slice(5, 7)} · ${time}`;
  return `${recurrence.frequency === 'daily' ? t?.('reminders.daily') ?? '' : t?.('reminders.weekly') ?? ''} · ${time}`;
}

function scheduleFrom(reminder: Reminder): EditedReminderSchedule {
  const recurrence = reminder.schedule.recurrence;
  const date = reminder.schedule.at.slice(0, 10);
  return { date, frequency: recurrence?.frequency ?? 'one-time', time: recurrence?.time ?? reminder.schedule.at.slice(11, 16), weekdays: recurrence?.weekdays?.length ? recurrence.weekdays : [new Date(`${date}T12:00:00`).getDay()] };
}

function draftScheduleText(schedule: EditedReminderSchedule, t: Translator): string {
  if (schedule.frequency === 'daily') return `${t('reminders.daily')} · ${schedule.time}`;
  if (schedule.frequency === 'weekly') return `${t('reminders.weekly')} · ${schedule.time}`;
  return `${schedule.date.slice(8, 10)}/${schedule.date.slice(5, 7)} · ${schedule.time}`;
}

function toMinutes(value: string): number { return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5)); }

export function RemindersScreen({ data, onEvent, onReminderStatusChange, onCreateReminder, onRenameReminder, onDeleteReminder, onEditReminderSchedule }: Props) {
  const t = useT();
  const text = (key: DictionaryKey, values: Record<string, string | number> = {}) => Object.entries(values).reduce((value, [name, replacement]) => value.replace(`{${name}}`, String(replacement)), t(key));
  const [filter, setFilter] = useState<'all' | 'important' | 'wellbeing'>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [scheduleDraft, setScheduleDraft] = useState<EditedReminderSchedule>({ date: '', frequency: 'one-time', time: '09:00', weekdays: [] });
  const [pastError, setPastError] = useState(false);
  const rhythm = deriveReminderRhythm(data.reminders, new Date());
  const visible = useMemo(() => data.reminders.filter((item) => filter === 'all' || item.category === filter), [data.reminders, filter]);
  const deleting = data.reminders.find((item) => item.id === deleteId);
  const activeRecurring = data.reminders.filter((item) => item.status !== 'paused' && item.schedule.recurrence);
  const closePair = activeRecurring.flatMap((item, index) => activeRecurring.slice(index + 1).filter((other) => Math.abs(toMinutes(item.schedule.recurrence?.time ?? item.schedule.at.slice(11, 16)) - toMinutes(other.schedule.recurrence?.time ?? other.schedule.at.slice(11, 16))) <= 60).map((other) => [item, other] as const))[0];

  const beginEdit = (reminder: Reminder) => { setEditing(reminder); setTitleDraft(reminder.title); setScheduleDraft(scheduleFrom(reminder)); setPastError(false); };
  const reviewSpacing = () => { if (!closePair) return; beginEdit(closePair.find((item) => item.category !== 'important') ?? closePair[1]); onEvent('validation', 'Revisar espaçamento dos lembretes', 'needs-review'); };
  const saveEdit = () => {
    if (!editing || !titleDraft.trim()) return;
    if (scheduleDraft.frequency === 'one-time' && isPastWallClock(scheduleDraft.date, scheduleDraft.time)) { setPastError(true); return; }
    if (titleDraft.trim() !== editing.title) onRenameReminder?.(editing.id, titleDraft.trim());
    onEditReminderSchedule?.(editing.id, scheduleDraft);
    onEvent('edit', editing.title, 'schedule-save-requested');
    setEditing(null);
  };

  return <HibiUiRoot className="reminders-screen">
    <SectionHeader title={t('reminders.title')} subtitle={text('reminders.activeSummary', { active: data.reminders.filter((item) => item.status !== 'paused').length, paused: rhythm.paused, suffix: rhythm.paused === 1 ? '' : 's' })} actions={<Button variant="primary" onPress={onCreateReminder}><Plus size={17} />{t('reminders.new')}</Button>} />
    {closePair && <div className="reminders-screen__notice"><div><strong>{t('reminders.notice.title')}</strong><p>{t('reminders.notice.description')}</p></div><Button variant="secondary" onPress={reviewSpacing}>{t('reminders.notice.action')}</Button></div>}
    <div className="reminders-screen__layout">
      <aside aria-label={t('reminders.filter.aria')}><span>{t('reminders.show')}</span>{([['all', t('reminders.all')], ['important', t('reminders.important')], ['wellbeing', t('reminders.wellbeing')]] as const).map(([key, label]) => <button key={key} type="button" data-active={filter === key} aria-pressed={filter === key} onClick={() => { setFilter(key); onEvent('filter', text('reminders.filter.event', { label })); }}>{label}<small>{key === 'all' ? data.reminders.length : data.reminders.filter((item) => item.category === key).length}</small></button>)}</aside>
      <section aria-labelledby="reminders-list-title"><div className="reminders-screen__heading"><h2 id="reminders-list-title">{filter === 'all' ? t('reminders.allTitle') : filter === 'important' ? t('reminders.important') : t('reminders.wellbeing')}</h2><p>{t('reminders.nextHint')}</p></div><Card className="reminders-screen__list">{visible.length ? <ul>{visible.map((reminder) => { const paused = reminder.status === 'paused'; return <li key={reminder.id}><span className="reminders-screen__icon" data-tone={reminder.category}><Bell size={16} /></span><div><strong>{reminder.title}</strong><span>{scheduleText(reminder, t)}</span></div><HibiTag tone={paused ? 'neutral' : reminder.category === 'important' ? 'peach' : 'mint'}>{paused ? t('reminders.paused') : reminder.category === 'important' ? t('reminders.important') : t('reminders.wellbeing')}</HibiTag><div className="reminders-screen__actions"><Button isIconOnly variant="ghost" aria-label={text('reminders.action.edit', { title: reminder.title })} onPress={() => beginEdit(reminder)}><CalendarClock size={16} /></Button><Button isIconOnly variant="ghost" aria-label={text(paused ? 'reminders.action.resume' : 'reminders.action.pause', { title: reminder.title })} onPress={() => { onReminderStatusChange(reminder.id, paused ? 'open' : 'paused'); onEvent(paused ? 'resume' : 'pause', reminder.title); }}>{paused ? <Play size={16} /> : <Pause size={16} />}</Button><Button isIconOnly variant="ghost" aria-label={text('reminders.action.delete', { title: reminder.title })} onPress={() => setDeleteId(reminder.id)}><Trash2 size={16} /></Button></div></li>; })}</ul> : <HibiEmptyState icon={Bell} tone="mint" title={t('reminders.empty')} description={t('reminders.empty.description')} action={<Button variant="secondary" onPress={onCreateReminder}>{t('reminders.create')}</Button>} />}</Card></section>
      <Card className="reminders-screen__summary"><h2>{t('reminders.summary.title')}</h2>{rhythm.next ? <><strong>{rhythm.next.title}</strong><p>{scheduleText(rhythm.next, t)}</p></> : <p>{t('reminders.summary.empty')}</p>}<div><span>{rhythm.overdue}<small>{t('reminders.summary.overdue')}</small></span><span>{rhythm.paused}<small>{t('reminders.summary.paused')}</small></span></div></Card>
    </div>
    {editing && <ActionDialog trigger={<Button className="reminders-screen__hidden-trigger">{t('reminders.edit.trigger')}</Button>} isOpen onOpenChange={(open) => !open && setEditing(null)} title={t('reminders.edit.trigger')} description={t('reminders.edit.description')}><form className="reminders-screen__form" onSubmit={(event) => { event.preventDefault(); saveEdit(); }}><label>{t('reminders.field.name')}<input value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} autoFocus required /></label><label>{t('reminders.field.recurrence')}<select value={scheduleDraft.frequency} onChange={(event) => { setScheduleDraft((draft) => ({ ...draft, frequency: event.target.value as EditedReminderSchedule['frequency'] })); setPastError(false); }}><option value="one-time">{t('reminders.once')}</option><option value="daily">{t('reminders.daily')}</option><option value="weekly">{t('reminders.weekly')}</option></select></label>{scheduleDraft.frequency === 'one-time' && <label>{t('reminders.field.date')}<input type="date" value={scheduleDraft.date} onChange={(event) => { setScheduleDraft((draft) => ({ ...draft, date: event.target.value })); setPastError(false); }} required /></label>}<label>{t('reminders.field.time')}<input type="time" value={scheduleDraft.time} onChange={(event) => { setScheduleDraft((draft) => ({ ...draft, time: event.target.value })); setPastError(false); }} required /></label>{scheduleDraft.frequency === 'weekly' && <fieldset><legend>{t('reminders.field.weekdays')}</legend><div>{weekdayKeys.map(([key, day]) => <label key={day} className="reminders-screen__weekday"><input type="checkbox" checked={scheduleDraft.weekdays.includes(day)} onChange={() => setScheduleDraft((draft) => ({ ...draft, weekdays: draft.weekdays.includes(day) ? draft.weekdays.filter((item) => item !== day) : [...draft.weekdays, day].sort() }))} />{t(key)}</label>)}</div></fieldset>}<p className="reminders-screen__preview">{t('reminders.nextOccurrence')} <strong>{draftScheduleText(scheduleDraft, t)}</strong></p>{pastError && <p role="alert" className="reminders-screen__error">{t('reminders.futureTime')}</p>}<div className="reminders-screen__confirm"><Button type="button" variant="secondary" onPress={() => setEditing(null)}>{t('reminders.cancel')}</Button><Button type="submit" variant="primary">{t('reminders.saveChanges')}</Button></div></form></ActionDialog>}
    {deleting && <ActionDialog trigger={<Button className="reminders-screen__hidden-trigger">{t('reminders.delete.trigger')}</Button>} isOpen onOpenChange={(open) => !open && setDeleteId(null)} title={t('reminders.delete.title')} description={text('reminders.delete.description', { title: deleting.title })}><div className="reminders-screen__confirm"><Button variant="secondary" onPress={() => setDeleteId(null)}>{t('reminders.cancel')}</Button><Button variant="danger" onPress={() => { onDeleteReminder?.(deleting.id); setDeleteId(null); }}>{t('reminders.delete')}</Button></div></ActionDialog>}
  </HibiUiRoot>;
}

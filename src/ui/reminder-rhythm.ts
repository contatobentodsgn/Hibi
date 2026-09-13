import { localDateKey } from '../domain/date-context';
import type { Reminder } from '../domain/models';

type ReminderState = 'overdue' | 'next' | 'paused';

export type ReminderRhythm = Readonly<{
  next: Reminder | null;
  overdue: number;
  paused: number;
  stateById: Readonly<Record<string, ReminderState>>;
}>;

const wallClock = (now: Date) => `${localDateKey(now)}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;

function nextAt(reminder: Reminder, now: Date): string | null {
  const recurrence = reminder.schedule.recurrence;
  if (!recurrence) return reminder.schedule.at;
  const timeFor = (day: number) => recurrence.timesByWeekday?.[day] ?? recurrence.time ?? reminder.schedule.at.slice(11, 16);
  for (let offset = 0; offset <= 7; offset += 1) {
    const date = new Date(now);
    date.setDate(date.getDate() + offset);
    const key = localDateKey(date);
    if (key < recurrence.startDate || (recurrence.endDate && key > recurrence.endDate)) continue;
    if (recurrence.frequency === 'weekly' && !(recurrence.weekdays ?? []).includes(date.getDay())) continue;
    const candidate = `${key}T${timeFor(date.getDay())}:00`;
    if (candidate >= wallClock(now)) return candidate;
  }
  return null;
}

export function deriveReminderRhythm(reminders: readonly Reminder[], now: Date): ReminderRhythm {
  const stateById: Record<string, ReminderState> = {};
  const active: Array<{ reminder: Reminder; at: string }> = [];
  let overdue = 0;
  let paused = 0;
  for (const reminder of reminders) {
    if (reminder.status === 'paused') { stateById[reminder.id] = 'paused'; paused += 1; continue; }
    if (!reminder.schedule.recurrence && reminder.schedule.at < wallClock(now)) { stateById[reminder.id] = 'overdue'; overdue += 1; continue; }
    const at = nextAt(reminder, now);
    if (at) { stateById[reminder.id] = 'next'; active.push({ reminder, at }); }
  }
  active.sort((left, right) => left.at.localeCompare(right.at));
  return { next: active[0]?.reminder ?? null, overdue, paused, stateById };
}

import type { RecurrenceRule, ScheduleBlock } from './models';

const OFFSET = '-03:00';

export function toDateKey(value: string): string {
  return value.slice(0, 10);
}

export function durationMinutes(block: ScheduleBlock): number {
  return Math.round((Date.parse(block.end) - Date.parse(block.start)) / 60000);
}

function addDays(dateKey: string, amount: number): string {
  const date = new Date(`${dateKey}T12:00:00${OFFSET}`);
  date.setDate(date.getDate() + amount);
  return date.toISOString().slice(0, 10);
}

function weekday(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00${OFFSET}`).getDay();
}

export function expandRecurrence(rule: RecurrenceRule, from: string, to: string): string[] {
  const results: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (date < rule.startDate || (rule.endDate && date > rule.endDate)) continue;
    const day = weekday(date);
    const matches = rule.frequency === 'daily' || (rule.weekdays ?? []).includes(day);
    if (!matches) continue;
    const time = rule.timesByWeekday?.[day] ?? rule.time;
    if (time) results.push(`${date}T${time}:00${OFFSET}`);
  }
  return results;
}

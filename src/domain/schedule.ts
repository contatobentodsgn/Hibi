import { localNoon, shiftDayKey } from './date-context';
import type { RecurrenceRule, ScheduleBlock } from './models';

export function toDateKey(value: string): string {
  return value.slice(0, 10);
}

export function durationMinutes(block: ScheduleBlock): number {
  return Math.round((Date.parse(block.end) - Date.parse(block.start)) / 60000);
}

// Mesmo defeito que `recurrence.ts` tinha: montar o dia a partir de um instante fixo em `-03:00`
// misturava o dia-da-semana local com o dia UTC. A leste de ~UTC+09 o `getDay()` já era o do dia
// seguinte e a recorrência inteira saía deslocada em um dia. Dia e dia-da-semana são calendário.
function weekday(dateKey: string): number {
  return localNoon(dateKey).getDay();
}

export function expandRecurrence(rule: RecurrenceRule, from: string, to: string): string[] {
  const results: string[] = [];
  for (let date = from; date <= to; date = shiftDayKey(date, 1)) {
    if (date < rule.startDate || (rule.endDate && date > rule.endDate)) continue;
    const day = weekday(date);
    const matches = rule.frequency === 'daily' || (rule.weekdays ?? []).includes(day);
    if (!matches) continue;
    const time = rule.timesByWeekday?.[day] ?? rule.time;
    if (time) results.push(`${date}T${time}:00`);
  }
  return results;
}

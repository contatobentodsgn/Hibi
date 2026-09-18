import { localDateKey, shiftDayKey } from './date-context';
import type { ScheduleBlock } from './models';

const DAY_START_MINUTES = 8 * 60;
const DAY_END_MINUTES = 22 * 60;
const STEP_MINUTES = 30;
const pad = (value: number) => String(value).padStart(2, '0');
const wallClock = (day: string, minutes: number) => `${day}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00`;
const minutesOf = (value: string) => Number(value.slice(11, 13)) * 60 + Number(value.slice(14, 16));

/**
 * O primeiro horário livre para uma tarefa, de agora até o dia do prazo, dentro do dia de trabalho
 * (08h–22h) e em passos de meia hora. É o que deixa a sugestão "sem agenda" do Review ser resolvida ali
 * mesmo: antes ela só mandava para a Semana, onde nenhum bloco criado se ligava à tarefa. `null` quando
 * não há horário livre até o prazo.
 */
export function findFreeSlot({ blocks, durationMinutes, now, lastDay }: Readonly<{ blocks: readonly ScheduleBlock[]; durationMinutes: number; now: Date; lastDay: string }>): Readonly<{ start: string; end: string }> | null {
  if (!(durationMinutes > 0) || durationMinutes > DAY_END_MINUTES - DAY_START_MINUTES) return null;
  const today = localDateKey(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  for (let day = today; day <= lastDay; day = shiftDayKey(day, 1)) {
    const taken = blocks.filter((block) => block.start.slice(0, 10) === day || block.end.slice(0, 10) === day).map((block) => ({
      from: block.start.slice(0, 10) < day ? 0 : minutesOf(block.start),
      to: block.end.slice(0, 10) > day ? 24 * 60 : minutesOf(block.end),
    }));
    const earliest = day === today ? Math.ceil(nowMinutes / STEP_MINUTES) * STEP_MINUTES : 0;
    for (let start = Math.max(DAY_START_MINUTES, earliest); start + durationMinutes <= DAY_END_MINUTES; start += STEP_MINUTES) {
      const end = start + durationMinutes;
      if (taken.every((slot) => end <= slot.from || start >= slot.to)) return { start: wallClock(day, start), end: wallClock(day, end) };
    }
  }
  return null;
}

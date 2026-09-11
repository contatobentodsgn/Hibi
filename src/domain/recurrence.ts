import { localDateKey, localNoon } from './date-context';

const weekdayNumber: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

// O dia pedido ("Tue 09:00") é de calendário, não um instante. Ancorar em `-03:00` lia o
// dia-da-semana no relógio local e devolvia o dia em UTC — dois calendários na mesma conta. Fora de
// UTC-03 os dois discordavam e o lembrete semanal era gravado no dia errado: em UTC+14 uma terça
// pedida a partir de segunda 07/09 voltava como 07/09, que é segunda.
export function firstWeeklyOccurrence(startDate: string, parts: string[]): { date: string; time: string } | undefined {
  return parts.map((part) => {
    const day = weekdayNumber[part.slice(0, 3).toLowerCase()];
    if (day === undefined || !/^\d{2}:\d{2}$/.test(part.slice(4))) return undefined;
    const date = localNoon(startDate);
    date.setDate(date.getDate() + ((day - date.getDay() + 7) % 7));
    return { date: localDateKey(date), time: part.slice(4) };
  }).filter((item): item is { date: string; time: string } => Boolean(item)).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))[0];
}

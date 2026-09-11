import { localDateKey, localNoon } from './date-context';
import type { Reminder } from './models';

const weekdayNumber: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const weekdayLabel = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Um dia de calendário que sobrevive à ida e volta por `localNoon`. Rejeita tanto o que não tem a
// forma `AAAA-MM-DD` quanto o que tem a forma mas não existe: `2026-02-31` volta como `2026-03-03`.
const isCalendarDay = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && localDateKey(localNoon(value)) === value;

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

// Conserta o `schedule.at` que a versão antiga de `firstWeeklyOccurrence` gravou no dia errado.
//
// Adivinhar o fuso em que o lembrete foi criado é impossível, então o critério não é esse: para um
// lembrete semanal o dado com intenção do usuário é o dia da semana, e ele está em `weekdays`. Se o
// dia de `at` não é nenhum dos dias em que o lembrete diz repetir, o registro contradiz a si mesmo
// — a primeira ocorrência caindo fora da própria recorrência — e só o bug produz isso. Aí, e só aí,
// ele é reancorado na primeira ocorrência a partir de `startDate`, que é o que o cálculo corrigido
// teria gravado. Qualquer outro caso volta pelo mesmo objeto, sem cópia: um `at` num dia que o
// lembrete de fato repete pode ser uma ocorrência legítima mais adiante na semana, e reescrever
// isso seria estragar dado correto. Idempotente por construção — o dia reancorado está em
// `weekdays`, então a segunda passada já não reconhece nada para corrigir.
export function repairWeeklyAnchor(reminder: Reminder): Reminder {
  const recurrence = reminder?.schedule?.recurrence;
  if (recurrence?.frequency !== 'weekly') return reminder;
  const weekdays = recurrence.weekdays;
  if (!Array.isArray(weekdays) || weekdays.length === 0 || !weekdays.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)) return reminder;
  if (!isCalendarDay(recurrence.startDate)) return reminder;
  const at = reminder.schedule.at;
  if (typeof at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(at) || !isCalendarDay(at.slice(0, 10))) return reminder;
  if (weekdays.includes(localNoon(at.slice(0, 10)).getDay())) return reminder;
  const storedTime = at.slice(11, 16);
  const first = firstWeeklyOccurrence(recurrence.startDate, weekdays.map((day) => `${weekdayLabel[day]} ${recurrence.timesByWeekday?.[day] ?? recurrence.time ?? storedTime}`));
  if (!first) return reminder;
  // Só o dia e a hora são reescritos; o sufixo gravado (`:00-03:00`, `:00Z`, ou nada) fica como está.
  return { ...reminder, schedule: { ...reminder.schedule, at: `${first.date}T${first.time}${at.slice(16)}` } };
}

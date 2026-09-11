import { shiftDayKey, todayKey } from '../domain/date-context';
import { firstWeeklyOccurrence } from '../domain/recurrence';
import type { Reminder, ScheduleBlock, StudyData, Task } from '../domain/models';

// O horário do workspace inteiro é serializado em -03:00 (ver OFFSET em `domain/schedule.ts`,
// `ui/DayView`, `ui/WeekView` e `App`, e o `HIBI_TIME_ZONE` de `i18n/format`); o seed segue a mesma
// convenção para não ser o único a falar outra língua. O que nunca é fixo aqui é o DIA: ele sai de
// `todayKey`/`shiftDayKey`, sempre por componentes locais da data — nada de `toISOString()`, que
// devolveria o dia UTC e, a leste ou a oeste de UTC-03, ancoraria a demonstração no dia errado.
const OFFSET = '-03:00';
const at = (date: string, time: string) => `${date}T${time}:00${OFFSET}`;

const SEED_DAYS = 5;

/** Os cinco dias da demonstração: hoje e os quatro seguintes. Começar em "hoje" é o ponto — uma
 * instalação nova precisa abrir num dia povoado, seja qual for a data da instalação. */
const seedDayKeys = (now: Date = new Date()): string[] => {
  const first = todayKey(now);
  return Array.from({ length: SEED_DAYS }, (_, index) => shiftDayKey(first, index));
};

const tasks: Task[] = [
  ...Array.from({ length: 6 }, (_, index) => ({ id: `kabrito-${index + 1}`, title: `Kabrito Post ${String(index + 1).padStart(2, '0')}`, durationMinutes: 60, category: 'work' as const, folder: 'Bento' })),
  { id: 'marina-1', title: 'Marina Post 01', durationMinutes: 60, category: 'work', folder: 'Bento' },
  { id: 'marina-2', title: 'Marina Post 02', durationMinutes: 60, category: 'work', folder: 'Bento' },
];

// As duas aulas de inglês caem no segundo e no quarto dia da série, como na demonstração original:
// uma no fim da noite, outra logo cedo, para a semana não parecer um bloco uniforme.
const ENGLISH_EVENING_DAY = 1;
const ENGLISH_MORNING_DAY = 3;

function addBlocks(date: string, dayIndex: number): ScheduleBlock[] {
  const blocks: ScheduleBlock[] = [];
  const times: Array<[string, string, string, string, boolean?]> = [
    ['09:00', '10:00', 'Kabrito Post 01', 'work'], ['10:00', '11:00', 'Kabrito Post 02', 'work'], ['11:00', '12:00', 'Kabrito Post 03', 'work'],
    ['12:00', '14:00', 'Almoço', 'break', true], ['14:00', '15:00', 'Kabrito Post 04', 'work'], ['15:00', '16:00', 'Kabrito Post 05', 'work'], ['16:00', '17:00', 'Kabrito Post 06', 'work'],
    ['17:00', '19:00', 'Caminhada', 'break', true], ['19:00', '20:00', 'Marina Post 01', 'work'], ['20:00', '21:00', 'Marina Post 02', 'work'],
  ];
  for (const [start, end, title, category, isHard] of times) blocks.push({ id: `${date}-${start}`, title, start: at(date, start), end: at(date, end), category: category as ScheduleBlock['category'], isHard });
  if (dayIndex === ENGLISH_EVENING_DAY) blocks.push({ id: `${date}-english`, title: 'Aula de inglês', start: at(date, '21:00'), end: at(date, '22:00'), category: 'learning', isHard: true });
  if (dayIndex === ENGLISH_MORNING_DAY) blocks.push({ id: `${date}-english`, title: 'Aula de inglês', start: at(date, '08:00'), end: at(date, '09:00'), category: 'learning', isHard: true });
  return blocks;
}

export function createSeedData(now: Date = new Date()): StudyData {
  const days = seedDayKeys(now);
  // O lembrete recorrente continua caindo numa terça de verdade: `firstWeeklyOccurrence` procura a
  // primeira terça a partir do primeiro dia do seed, em calendário local, em vez de fixar uma data.
  const first = firstWeeklyOccurrence(days[0], ['Tue 09:00', 'Wed 20:00'])!;
  const reminder: Reminder = {
    id: 'horizontes', title: 'vaga/inglês - Horizontes', category: 'important', status: 'open',
    schedule: { at: at(first.date, first.time), recurrence: { frequency: 'weekly', weekdays: [2, 3], timesByWeekday: { 2: '09:00', 3: '20:00' }, startDate: days[0] } },
  };
  // Deep-clone the shared seed objects so each caller gets its own copies: tests and workspace
  // resets mutate what they receive, and callers must not leak changes into later calls.
  return { activity: [], tasks: structuredClone(tasks), reminders: [structuredClone(reminder)], habits: [], goals: [], notes: [], blocks: days.flatMap(addBlocks), telemetry: [] };
}

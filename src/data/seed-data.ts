import type { Reminder, ScheduleBlock, StudyData, Task } from '../domain/models';

const OFFSET = '-03:00';
const weekdays = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11'];
const at = (date: string, time: string) => `${date}T${time}:00${OFFSET}`;

const tasks: Task[] = [
  ...Array.from({ length: 6 }, (_, index) => ({ id: `kabrito-${index + 1}`, title: `Kabrito Post ${String(index + 1).padStart(2, '0')}`, durationMinutes: 60, category: 'work' as const, folder: 'Bento' })),
  { id: 'marina-1', title: 'Marina Post 01', durationMinutes: 60, category: 'work', folder: 'Bento' },
  { id: 'marina-2', title: 'Marina Post 02', durationMinutes: 60, category: 'work', folder: 'Bento' },
];

function addBlocks(date: string): ScheduleBlock[] {
  const blocks: ScheduleBlock[] = [];
  const times: Array<[string, string, string, string, boolean?]> = [
    ['09:00', '10:00', 'Kabrito Post 01', 'work'], ['10:00', '11:00', 'Kabrito Post 02', 'work'], ['11:00', '12:00', 'Kabrito Post 03', 'work'],
    ['12:00', '14:00', 'Almoço', 'break', true], ['14:00', '15:00', 'Kabrito Post 04', 'work'], ['15:00', '16:00', 'Kabrito Post 05', 'work'], ['16:00', '17:00', 'Kabrito Post 06', 'work'],
    ['17:00', '19:00', 'Caminhada', 'break', true], ['19:00', '20:00', 'Marina Post 01', 'work'], ['20:00', '21:00', 'Marina Post 02', 'work'],
  ];
  for (const [start, end, title, category, isHard] of times) blocks.push({ id: `${date}-${start}`, title, start: at(date, start), end: at(date, end), category: category as ScheduleBlock['category'], isHard });
  if (date === '2026-09-08') blocks.push({ id: `${date}-english`, title: 'Aula de inglês', start: at(date, '21:00'), end: at(date, '22:00'), category: 'learning', isHard: true });
  if (date === '2026-09-10') blocks.push({ id: `${date}-english`, title: 'Aula de inglês', start: at(date, '08:00'), end: at(date, '09:00'), category: 'learning', isHard: true });
  return blocks;
}

export function createSeedData(): StudyData {
  const reminder: Reminder = {
    id: 'horizontes', title: 'vaga/inglês - Horizontes', category: 'important', status: 'open',
    schedule: { at: at('2026-09-08', '09:00'), recurrence: { frequency: 'weekly', weekdays: [2, 3], timesByWeekday: { 2: '09:00', 3: '20:00' }, startDate: '2026-09-07' } },
  };
  return { tasks, reminders: [reminder], notes: [], blocks: weekdays.flatMap(addBlocks), telemetry: [] };
}

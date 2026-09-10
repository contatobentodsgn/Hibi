import { ACTIVITY_TYPES, type ActivityRecord, type KnownActivityType } from './activity';
import { folderOf } from './folders';

export type StatsPreset = 'today' | 'week' | 'month' | 'custom';
export interface StatsPeriod { start: string; endExclusive: string; preset: StatsPreset }
export interface DailyMetric { date: string; tasksCompleted: number; focusMinutes: number; plannedMinutes: number; completedMinutes: number }
export interface DistributionMetric { key: string; tasksCompleted: number; minutes: number }
export interface StatsSummary {
  period: StatsPeriod;
  tasksCompleted: number;
  plannedMinutes: number;
  completedMinutes: number;
  focusSessions: number;
  focusMinutes: number;
  habitCheckIns: number;
  goalsCompleted: number;
  daily: readonly DailyMetric[];
  categories: readonly DistributionMetric[];
  folders: readonly DistributionMetric[];
  partialHistory: boolean;
}
export type StatsComparison = Readonly<Record<
  'tasksCompleted' | 'plannedMinutes' | 'completedMinutes' | 'focusSessions' | 'focusMinutes' | 'habitCheckIns' | 'goalsCompleted',
  number
>>;

const KNOWN_TYPES = new Set<string>(ACTIVITY_TYPES);
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const UNCATEGORIZED = 'none';

const midnight = (year: number, month: number, day: number) => new Date(year, month, day);
const atMidnight = (date: Date) => midnight(date.getFullYear(), date.getMonth(), date.getDate());
const shiftDays = (date: Date, days: number) => midnight(date.getFullYear(), date.getMonth(), date.getDate() + days);
const pad = (value: number) => String(value).padStart(2, '0');
const localDateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const period = (start: Date, endExclusive: Date, preset: StatsPreset): StatsPeriod => ({
  start: start.toISOString(),
  endExclusive: endExclusive.toISOString(),
  preset,
});

function parseLocalDate(value: string): Date {
  const match = DATE_PATTERN.exec(value);
  if (match) {
    const [year, month, day] = match.slice(1).map(Number);
    const date = midnight(year, month - 1, day);
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) return date;
  }
  throw new RangeError(`Invalid stats date: ${value}`);
}

// Dias de calendário pelos componentes locais, para um dia de 23 ou 25 horas (horário de verão) contar como um.
const calendarDaysBetween = (start: Date, end: Date) =>
  Math.round((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate())
    - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86_400_000);

export function resolveStatsPeriod(preset: StatsPreset, reference: Date, custom?: { start: string; end: string }): StatsPeriod {
  if (Number.isNaN(reference.getTime())) throw new RangeError('Invalid stats reference date');
  const today = atMidnight(reference);

  switch (preset) {
    case 'today':
      return period(today, shiftDays(today, 1), preset);
    case 'week': {
      const monday = shiftDays(today, -((today.getDay() + 6) % 7));
      return period(monday, shiftDays(monday, 7), preset);
    }
    case 'month':
      return period(midnight(today.getFullYear(), today.getMonth(), 1), midnight(today.getFullYear(), today.getMonth() + 1, 1), preset);
    case 'custom': {
      if (!custom) throw new RangeError('A custom stats period needs start and end dates');
      const start = parseLocalDate(custom.start);
      const end = parseLocalDate(custom.end);
      if (end < start) throw new RangeError('The stats period ends before it starts');
      return period(start, shiftDays(end, 1), preset);
    }
  }
}

export function previousPeriod(current: StatsPeriod): StatsPeriod {
  const start = new Date(current.start);
  if (current.preset === 'month') {
    return period(midnight(start.getFullYear(), start.getMonth() - 1, 1), start, current.preset);
  }
  const days = calendarDaysBetween(start, new Date(current.endExclusive));
  return period(shiftDays(start, -days), start, current.preset);
}

interface Totals {
  completed: number;
  reopened: number;
  completedMinutes: number;
  reopenedMinutes: number;
  plannedMinutes: number;
  deletedMinutes: number;
  focusMinutes: number;
}

const emptyTotals = (): Totals => ({
  completed: 0,
  reopened: 0,
  completedMinutes: 0,
  reopenedMinutes: 0,
  plannedMinutes: 0,
  deletedMinutes: 0,
  focusMinutes: 0,
});

// O registro é só de acréscimo: reversões são eventos novos, então o saldo pode ficar negativo no período.
const net = (added: number, removed: number) => Math.max(0, added - removed);
const minutesOf = (record: ActivityRecord) =>
  Number.isFinite(record.durationMinutes) && record.durationMinutes! > 0 ? record.durationMinutes! : 0;

function addToTotals(totals: Totals, type: KnownActivityType, minutes: number): void {
  switch (type) {
    case 'task.completed':
      totals.completed += 1;
      totals.completedMinutes += minutes;
      break;
    case 'task.reopened':
      totals.reopened += 1;
      totals.reopenedMinutes += minutes;
      break;
    case 'block.created':
      totals.plannedMinutes += minutes;
      break;
    case 'block.deleted':
      totals.deletedMinutes += minutes;
      break;
    case 'focus.completed':
    case 'focus.cancelled':
      totals.focusMinutes += minutes;
      break;
    default:
      break;
  }
}

function distribution(totals: Map<string, Totals>): DistributionMetric[] {
  return [...totals]
    .map(([key, entry]) => ({
      key,
      tasksCompleted: net(entry.completed, entry.reopened),
      minutes: net(entry.completedMinutes, entry.reopenedMinutes),
    }))
    .filter((entry) => entry.tasksCompleted > 0 || entry.minutes > 0)
    .sort((a, b) => b.tasksCompleted - a.tasksCompleted || a.key.localeCompare(b.key, 'pt-BR'));
}

const totalsFor = (map: Map<string, Totals>, key: string) => {
  const existing = map.get(key);
  if (existing) return existing;
  const created = emptyTotals();
  map.set(key, created);
  return created;
};

export function calculateStats(records: readonly ActivityRecord[], statsPeriod: StatsPeriod): StatsSummary {
  const startDate = new Date(statsPeriod.start);
  const startMs = startDate.getTime();
  const endMs = new Date(statsPeriod.endExclusive).getTime();

  const days = new Map<string, Totals>();
  for (let day = atMidnight(startDate); day.getTime() < endMs; day = shiftDays(day, 1)) {
    days.set(localDateKey(day), emptyTotals());
  }

  const overall = emptyTotals();
  const categories = new Map<string, Totals>();
  const folders = new Map<string, Totals>();
  let focusSessions = 0;
  let habitsCompleted = 0;
  let habitsReopened = 0;
  let goalsCompleted = 0;
  let earliestMs = Number.POSITIVE_INFINITY;

  for (const record of records) {
    if (record.seeded === true || !KNOWN_TYPES.has(record.type)) continue;
    const at = new Date(record.at);
    const atMs = at.getTime();
    if (Number.isNaN(atMs)) continue;
    earliestMs = Math.min(earliestMs, atMs);
    if (atMs < startMs || atMs >= endMs) continue;

    const type = record.type as KnownActivityType;
    const minutes = minutesOf(record);
    addToTotals(overall, type, minutes);
    const day = days.get(localDateKey(at));
    if (day) addToTotals(day, type, minutes);

    if (type === 'task.completed' || type === 'task.reopened') {
      addToTotals(totalsFor(categories, record.category ?? UNCATEGORIZED), type, minutes);
      addToTotals(totalsFor(folders, folderOf(record)), type, minutes);
    } else if (type === 'focus.completed') {
      focusSessions += 1;
    } else if (type === 'habit.completed') {
      habitsCompleted += 1;
    } else if (type === 'habit.reopened') {
      habitsReopened += 1;
    } else if (type === 'goal.completed') {
      goalsCompleted += 1;
    }
  }

  return {
    period: statsPeriod,
    tasksCompleted: net(overall.completed, overall.reopened),
    plannedMinutes: net(overall.plannedMinutes, overall.deletedMinutes),
    completedMinutes: net(overall.completedMinutes, overall.reopenedMinutes),
    focusSessions,
    focusMinutes: overall.focusMinutes,
    habitCheckIns: net(habitsCompleted, habitsReopened),
    goalsCompleted,
    daily: [...days].map(([date, totals]) => ({
      date,
      tasksCompleted: net(totals.completed, totals.reopened),
      focusMinutes: totals.focusMinutes,
      plannedMinutes: net(totals.plannedMinutes, totals.deletedMinutes),
      completedMinutes: net(totals.completedMinutes, totals.reopenedMinutes),
    })),
    categories: distribution(categories),
    folders: distribution(folders),
    partialHistory: startMs < earliestMs,
  };
}

export function compareStats(current: StatsSummary, previous: StatsSummary): StatsComparison {
  return {
    tasksCompleted: current.tasksCompleted - previous.tasksCompleted,
    plannedMinutes: current.plannedMinutes - previous.plannedMinutes,
    completedMinutes: current.completedMinutes - previous.completedMinutes,
    focusSessions: current.focusSessions - previous.focusSessions,
    focusMinutes: current.focusMinutes - previous.focusMinutes,
    habitCheckIns: current.habitCheckIns - previous.habitCheckIns,
    goalsCompleted: current.goalsCompleted - previous.goalsCompleted,
  };
}

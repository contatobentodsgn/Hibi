import { isActivityRecord, type ActivityRecord } from './activity';
import { folderOf, NO_FOLDER } from './folders';

export type StatsPreset = 'today' | 'week' | 'month' | 'custom';
export interface StatsPeriod { start: string; endExclusive: string; preset: StatsPreset }
/**
 * Variação assinada do dia: uma tarefa reaberta ou um bloco apagado subtrai no dia em que aconteceu,
 * então os valores podem ser negativos. A soma dos dias bate com o saldo do período antes do limite em zero.
 */
export interface DailyMetric { date: string; tasksCompleted: number; focusMinutes: number; plannedMinutes: number; completedMinutes: number }
/** Variação assinada de tarefas por chave: reaberturas subtraem, então os valores podem ser negativos. */
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

export const MAX_CUSTOM_PERIOD_DAYS = 366;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const UNCATEGORIZED = 'none';

const midnight = (year: number, month: number, day: number) => new Date(year, month, day);
const atMidnight = (date: Date) => midnight(date.getFullYear(), date.getMonth(), date.getDate());
const shiftDays = (date: Date, days: number) => midnight(date.getFullYear(), date.getMonth(), date.getDate() + days);
const pad = (value: number) => String(value).padStart(2, '0');
const localDateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const toPeriod = (start: Date, endExclusive: Date, preset: StatsPreset): StatsPeriod => ({
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
      return toPeriod(today, shiftDays(today, 1), preset);
    case 'week': {
      const monday = shiftDays(today, -((today.getDay() + 6) % 7));
      return toPeriod(monday, shiftDays(monday, 7), preset);
    }
    case 'month':
      return toPeriod(midnight(today.getFullYear(), today.getMonth(), 1), midnight(today.getFullYear(), today.getMonth() + 1, 1), preset);
    case 'custom': {
      if (!custom) throw new RangeError('A custom stats period needs start and end dates');
      const start = parseLocalDate(custom.start);
      const end = parseLocalDate(custom.end);
      if (end < start) throw new RangeError('The stats period ends before it starts');
      // Limita a série diária, que tem uma entrada por dia, a no máximo um ano.
      if (calendarDaysBetween(start, end) + 1 > MAX_CUSTOM_PERIOD_DAYS) {
        throw new RangeError(`A custom stats period can span at most ${MAX_CUSTOM_PERIOD_DAYS} days`);
      }
      return toPeriod(start, shiftDays(end, 1), preset);
    }
    default:
      // O tipo não chega aqui, mas o valor pode vir de fora (URL, armazenamento) sem passar pelo compilador.
      throw new RangeError(`Unknown stats preset: ${String(preset)}`);
  }
}

export function previousPeriod(period: StatsPeriod): StatsPeriod {
  const start = new Date(period.start);
  if (period.preset === 'month') {
    return toPeriod(midnight(start.getFullYear(), start.getMonth() - 1, 1), start, period.preset);
  }
  const days = calendarDaysBetween(start, new Date(period.endExclusive));
  return toPeriod(shiftDays(start, -days), start, period.preset);
}

type Metrics = Record<keyof StatsComparison, number>;

const emptyMetrics = (): Metrics => ({
  tasksCompleted: 0,
  plannedMinutes: 0,
  completedMinutes: 0,
  focusSessions: 0,
  focusMinutes: 0,
  habitCheckIns: 0,
  goalsCompleted: 0,
});

// O registro é só de acréscimo: reversões são eventos novos que subtraem, então cada evento vira uma
// variação assinada. Tipos fora das métricas (inclusive desconhecidos) não mudam nada.
function changeOf(type: string, minutes: number): Partial<Metrics> | undefined {
  switch (type) {
    case 'task.completed':
      return { tasksCompleted: 1, completedMinutes: minutes };
    case 'task.reopened':
      return { tasksCompleted: -1, completedMinutes: -minutes };
    case 'block.created':
      return { plannedMinutes: minutes };
    case 'block.deleted':
      return { plannedMinutes: -minutes };
    case 'focus.completed':
      return { focusSessions: 1, focusMinutes: minutes };
    case 'focus.cancelled':
      return { focusMinutes: minutes };
    case 'habit.completed':
      return { habitCheckIns: 1 };
    case 'habit.reopened':
      return { habitCheckIns: -1 };
    case 'goal.completed':
      return { goalsCompleted: 1 };
    case 'goal.reopened':
      return { goalsCompleted: -1 };
    default:
      return undefined;
  }
}

function addChange(target: Metrics, change: Partial<Metrics>): void {
  for (const [key, value] of Object.entries(change) as [keyof Metrics, number][]) target[key] += value;
}

const metricsFor = (map: Map<string, Metrics>, key: string) => {
  const existing = map.get(key);
  if (existing) return existing;
  const created = emptyMetrics();
  map.set(key, created);
  return created;
};

// Somas de minutos fracionários deixam ruído de ponto flutuante (0,1 + 0,2); `+ 0` evita devolver -0.
const wholeMinutes = (value: number) => Math.round(value) + 0;
// Só os totais do período param em zero: um período que só reabre tarefas de antes não tem saldo negativo.
const clamped = (value: number) => Math.max(0, value);

// Sem pasta fica por último no empate, como em `listFolders`.
const byKey = (a: string, b: string) =>
  Number(a === NO_FOLDER) - Number(b === NO_FOLDER) || a.localeCompare(b, 'pt-BR');

// Só eventos de tarefa mudam essas duas métricas; chaves que só receberam outros eventos ficam zeradas e saem.
function distribution(metrics: Map<string, Metrics>): DistributionMetric[] {
  return [...metrics]
    .map(([key, entry]) => ({ key, tasksCompleted: entry.tasksCompleted, minutes: wholeMinutes(entry.completedMinutes) }))
    .filter((entry) => entry.tasksCompleted !== 0 || entry.minutes !== 0)
    .sort((a, b) => b.tasksCompleted - a.tasksCompleted || byKey(a.key, b.key));
}

function parseBoundary(value: string, name: string): number {
  const date = new Date(value);
  // Exige a forma de `toISOString`: uma data sem hora e fuso seria lida em UTC, fora do dia local.
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) throw new RangeError(`Invalid stats period ${name}: ${value}`);
  return date.getTime();
}

export function calculateStats(records: readonly ActivityRecord[], period: StatsPeriod): StatsSummary {
  const startMs = parseBoundary(period.start, 'start');
  const endMs = parseBoundary(period.endExclusive, 'endExclusive');
  if (startMs >= endMs) throw new RangeError('The stats period must end after it starts');

  const days = new Map<string, Metrics>();
  for (let day = atMidnight(new Date(startMs)); day.getTime() < endMs; day = shiftDays(day, 1)) {
    days.set(localDateKey(day), emptyMetrics());
  }

  const overall = emptyMetrics();
  const categories = new Map<string, Metrics>();
  const folders = new Map<string, Metrics>();
  let earliestMs = Number.POSITIVE_INFINITY;

  for (const record of records) {
    if (record.seeded === true || !isActivityRecord(record)) continue;
    const at = new Date(record.at);
    const atMs = at.getTime();
    // Qualquer registro válido, mesmo de tipo desconhecido, prova que já havia histórico nessa data.
    earliestMs = Math.min(earliestMs, atMs);
    if (atMs < startMs || atMs >= endMs) continue;

    const change = changeOf(record.type, record.durationMinutes ?? 0);
    if (!change) continue;
    addChange(overall, change);
    const day = days.get(localDateKey(at));
    if (day) addChange(day, change);
    addChange(metricsFor(categories, record.category ?? UNCATEGORIZED), change);
    addChange(metricsFor(folders, folderOf(record)), change);
  }

  return {
    period,
    tasksCompleted: clamped(overall.tasksCompleted),
    plannedMinutes: clamped(wholeMinutes(overall.plannedMinutes)),
    completedMinutes: clamped(wholeMinutes(overall.completedMinutes)),
    focusSessions: overall.focusSessions,
    focusMinutes: wholeMinutes(overall.focusMinutes),
    habitCheckIns: clamped(overall.habitCheckIns),
    goalsCompleted: clamped(overall.goalsCompleted),
    daily: [...days].map(([date, metrics]) => ({
      date,
      tasksCompleted: metrics.tasksCompleted,
      focusMinutes: wholeMinutes(metrics.focusMinutes),
      plannedMinutes: wholeMinutes(metrics.plannedMinutes),
      completedMinutes: wholeMinutes(metrics.completedMinutes),
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

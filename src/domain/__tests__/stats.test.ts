import { describe, expect, it } from 'vitest';
import type { ActivityRecord } from '../activity';
import { NO_FOLDER } from '../folders';
import {
  calculateStats,
  compareStats,
  MAX_CUSTOM_PERIOD_DAYS,
  previousPeriod,
  resolveStatsPeriod,
  type StatsPeriod,
  type StatsPreset,
} from '../stats';

// Horários sempre construídos a partir de datas locais, para o teste valer em qualquer fuso.
const local = (year: number, month: number, day: number, hour = 0, minute = 0) =>
  new Date(year, month - 1, day, hour, minute).toISOString();

let sequence = 0;
const record = (type: string, at: string, extra: Partial<ActivityRecord> = {}): ActivityRecord => ({
  id: `activity-${++sequence}`,
  schemaVersion: 1,
  type,
  at,
  ...extra,
});

const custom = (start: string, end: string): StatsPeriod =>
  resolveStatsPeriod('custom', new Date(2026, 8, 10, 12), { start, end });

const september10 = new Date(2026, 8, 10, 15, 45);

describe('resolveStatsPeriod', () => {
  it('resolves today as the local calendar day', () => {
    expect(resolveStatsPeriod('today', september10)).toEqual({
      start: local(2026, 9, 10),
      endExclusive: local(2026, 9, 11),
      preset: 'today',
    });
  });

  it('resolves the week from Monday to the next Monday', () => {
    const expected = { start: local(2026, 9, 7), endExclusive: local(2026, 9, 14), preset: 'week' };
    expect(resolveStatsPeriod('week', september10)).toEqual(expected);
    expect(resolveStatsPeriod('week', new Date(2026, 8, 7, 0, 0))).toEqual(expected);
    expect(resolveStatsPeriod('week', new Date(2026, 8, 13, 23, 59))).toEqual(expected);
    expect(resolveStatsPeriod('week', new Date(2026, 8, 14, 0, 0)).start).toBe(local(2026, 9, 14));
  });

  it('resolves the month from its first day to the first day of the next month', () => {
    expect(resolveStatsPeriod('month', september10)).toEqual({
      start: local(2026, 9, 1),
      endExclusive: local(2026, 10, 1),
      preset: 'month',
    });
    expect(resolveStatsPeriod('month', new Date(2026, 11, 31, 23, 59))).toEqual({
      start: local(2026, 12, 1),
      endExclusive: local(2027, 1, 1),
      preset: 'month',
    });
  });

  it('turns an inclusive custom end date into the next local midnight', () => {
    expect(custom('2026-09-01', '2026-09-10')).toEqual({
      start: local(2026, 9, 1),
      endExclusive: local(2026, 9, 11),
      preset: 'custom',
    });
    expect(custom('2026-02-28', '2026-02-28').endExclusive).toBe(local(2026, 3, 1));
  });

  it('rejects invalid custom dates and an end before the start', () => {
    expect(() => custom('2026-02-30', '2026-03-01')).toThrow(RangeError);
    expect(() => custom('2026-09-01', '2026-13-01')).toThrow(RangeError);
    expect(() => custom('01/09/2026', '2026-09-10')).toThrow(RangeError);
    expect(() => custom('2026-09-10', '2026-09-09')).toThrow(RangeError);
    expect(() => resolveStatsPeriod('custom', september10)).toThrow(RangeError);
    expect(() => resolveStatsPeriod('today', new Date(Number.NaN))).toThrow(RangeError);
  });

  it('rejects an unknown preset at runtime', () => {
    expect(() => resolveStatsPeriod('year' as StatsPreset, september10)).toThrow(RangeError);
  });

  it('limits custom periods to a maximum number of calendar days', () => {
    expect(MAX_CUSTOM_PERIOD_DAYS).toBe(366);
    expect(custom('2024-01-01', '2024-12-31').endExclusive).toBe(local(2025, 1, 1));
    expect(custom('2026-01-01', '2027-01-01').endExclusive).toBe(local(2027, 1, 2));
    expect(() => custom('2026-01-01', '2027-01-02')).toThrow(RangeError);
  });
});

describe('previousPeriod', () => {
  it('returns yesterday for today, also across a month boundary', () => {
    expect(previousPeriod(resolveStatsPeriod('today', new Date(2026, 8, 1, 9)))).toEqual({
      start: local(2026, 8, 31),
      endExclusive: local(2026, 9, 1),
      preset: 'today',
    });
  });

  it('returns the previous week', () => {
    expect(previousPeriod(resolveStatsPeriod('week', september10))).toEqual({
      start: local(2026, 8, 31),
      endExclusive: local(2026, 9, 7),
      preset: 'week',
    });
  });

  it('returns the previous calendar month, whatever its length', () => {
    expect(previousPeriod(resolveStatsPeriod('month', new Date(2026, 2, 15)))).toEqual({
      start: local(2026, 2, 1),
      endExclusive: local(2026, 3, 1),
      preset: 'month',
    });
    expect(previousPeriod(resolveStatsPeriod('month', new Date(2026, 0, 15)))).toEqual({
      start: local(2025, 12, 1),
      endExclusive: local(2026, 1, 1),
      preset: 'month',
    });
  });

  it('returns the same number of days right before a custom period', () => {
    expect(previousPeriod(custom('2026-09-01', '2026-09-10'))).toEqual({
      start: local(2026, 8, 22),
      endExclusive: local(2026, 9, 1),
      preset: 'custom',
    });
  });
});

describe('calculateStats', () => {
  const september = resolveStatsPeriod('month', september10);

  it('uses half-open boundaries around midnight and month end', () => {
    const records = [
      record('task.completed', local(2026, 8, 31, 23, 59)),
      record('task.completed', local(2026, 9, 1, 0, 0)),
      record('task.completed', local(2026, 9, 30, 23, 59)),
      record('task.completed', local(2026, 10, 1, 0, 0)),
    ];

    expect(calculateStats(records, september).tasksCompleted).toBe(2);

    const today = resolveStatsPeriod('today', september10);
    const aroundMidnight = [
      record('task.completed', local(2026, 9, 9, 23, 59)),
      record('task.completed', local(2026, 9, 10, 0, 0)),
      record('task.completed', local(2026, 9, 10, 23, 59)),
      record('task.completed', local(2026, 9, 11, 0, 0)),
    ];
    expect(calculateStats(aroundMidnight, today).tasksCompleted).toBe(2);
  });

  it('nets reopened tasks against completed tasks and their minutes, never below zero', () => {
    const stats = calculateStats([
      record('task.completed', local(2026, 9, 2, 10), { durationMinutes: 30 }),
      record('task.completed', local(2026, 9, 3, 10), { durationMinutes: 45 }),
      record('task.reopened', local(2026, 9, 3, 11), { durationMinutes: 45 }),
    ], september);

    expect(stats.tasksCompleted).toBe(1);
    expect(stats.completedMinutes).toBe(30);

    const onlyReopened = calculateStats([
      record('task.reopened', local(2026, 9, 3, 11), { durationMinutes: 45 }),
    ], september);
    expect(onlyReopened.tasksCompleted).toBe(0);
    expect(onlyReopened.completedMinutes).toBe(0);
  });

  it('subtracts deleted blocks from planned minutes, never below zero', () => {
    const stats = calculateStats([
      record('block.created', local(2026, 9, 2, 8), { durationMinutes: 60 }),
      record('block.created', local(2026, 9, 2, 9), { durationMinutes: 90 }),
      record('block.deleted', local(2026, 9, 2, 10), { durationMinutes: 60 }),
      record('block.moved', local(2026, 9, 2, 11), { durationMinutes: 90 }),
      record('block.completed', local(2026, 9, 2, 12), { durationMinutes: 90 }),
    ], september);

    expect(stats.plannedMinutes).toBe(90);
    expect(calculateStats([
      record('block.deleted', local(2026, 9, 2, 10), { durationMinutes: 60 }),
    ], september).plannedMinutes).toBe(0);
  });

  it('keeps daily signed deltas adding up to the unclamped net while totals are clamped', () => {
    const period = custom('2026-09-02', '2026-09-03');
    const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

    const reopenedNextDay = calculateStats([
      record('task.completed', local(2026, 9, 2, 10), { durationMinutes: 30 }),
      record('block.created', local(2026, 9, 2, 11), { durationMinutes: 60 }),
      record('task.reopened', local(2026, 9, 3, 10), { durationMinutes: 30 }),
      record('block.deleted', local(2026, 9, 3, 11), { durationMinutes: 60 }),
    ], period);
    expect(reopenedNextDay.daily).toEqual([
      { date: '2026-09-02', tasksCompleted: 1, focusMinutes: 0, plannedMinutes: 60, completedMinutes: 30 },
      { date: '2026-09-03', tasksCompleted: -1, focusMinutes: 0, plannedMinutes: -60, completedMinutes: -30 },
    ]);
    expect(sum(reopenedNextDay.daily.map((day) => day.tasksCompleted))).toBe(0);
    expect(sum(reopenedNextDay.daily.map((day) => day.completedMinutes))).toBe(0);
    expect(reopenedNextDay).toMatchObject({ tasksCompleted: 0, completedMinutes: 0, plannedMinutes: 0 });

    // A tarefa concluída antes do período, reaberta dentro dele, deixa o saldo sem limite negativo.
    const alsoReopenedFromBefore = calculateStats([
      record('task.completed', local(2026, 9, 1, 9), { durationMinutes: 45 }),
      record('task.completed', local(2026, 9, 2, 10), { durationMinutes: 30 }),
      record('task.reopened', local(2026, 9, 3, 10), { durationMinutes: 30 }),
      record('task.reopened', local(2026, 9, 3, 12), { durationMinutes: 45 }),
    ], period);
    expect(alsoReopenedFromBefore.daily.map((day) => [day.tasksCompleted, day.completedMinutes])).toEqual([[1, 30], [-2, -75]]);
    expect(sum(alsoReopenedFromBefore.daily.map((day) => day.tasksCompleted))).toBe(1 - 2);
    expect(sum(alsoReopenedFromBefore.daily.map((day) => day.completedMinutes))).toBe(30 - 75);
    expect(alsoReopenedFromBefore.tasksCompleted).toBe(Math.max(0, 1 - 2));
    expect(alsoReopenedFromBefore.completedMinutes).toBe(Math.max(0, 30 - 75));
  });

  it('rounds minute outputs to whole minutes', () => {
    const stats = calculateStats([
      record('task.completed', local(2026, 9, 2, 9), { durationMinutes: 10.1, category: 'work', folder: 'Casa' }),
      record('task.completed', local(2026, 9, 2, 10), { durationMinutes: 10.2, category: 'work', folder: 'Casa' }),
      record('block.created', local(2026, 9, 2, 11), { durationMinutes: 30.4 }),
      record('block.created', local(2026, 9, 2, 12), { durationMinutes: 30.4 }),
      record('focus.completed', local(2026, 9, 2, 13), { durationMinutes: 0.1 }),
      record('focus.cancelled', local(2026, 9, 2, 14), { durationMinutes: 0.2 }),
    ], september);

    expect(stats).toMatchObject({ completedMinutes: 20, plannedMinutes: 61, focusMinutes: 0 });
    expect(stats.daily[1]).toEqual({ date: '2026-09-02', tasksCompleted: 2, focusMinutes: 0, plannedMinutes: 61, completedMinutes: 20 });
    expect(stats.categories).toEqual([{ key: 'work', tasksCompleted: 2, minutes: 20 }]);
    expect(stats.folders).toEqual([{ key: 'Casa', tasksCompleted: 2, minutes: 20 }]);
  });

  it('rejects periods with unreadable boundaries or that do not move forward', () => {
    const at = (start: string, endExclusive: string): StatsPeriod => ({ start, endExclusive, preset: 'custom' });

    expect(() => calculateStats([], at('not-a-date', local(2026, 9, 2)))).toThrow(RangeError);
    expect(() => calculateStats([], at(local(2026, 9, 1), 'not-a-date'))).toThrow(RangeError);
    expect(() => calculateStats([], at('2026-09-01', local(2026, 9, 2)))).toThrow(RangeError);
    expect(() => calculateStats([], at(local(2026, 9, 2), local(2026, 9, 2)))).toThrow(RangeError);
    expect(() => calculateStats([], at(local(2026, 9, 3), local(2026, 9, 2)))).toThrow(RangeError);
  });

  it('counts completed focus sessions and adds the minutes of cancelled ones', () => {
    const stats = calculateStats([
      record('focus.started', local(2026, 9, 4, 9)),
      record('focus.paused', local(2026, 9, 4, 9, 10)),
      record('focus.resumed', local(2026, 9, 4, 9, 12)),
      record('focus.completed', local(2026, 9, 4, 9, 30), { durationMinutes: 25 }),
      record('focus.started', local(2026, 9, 4, 14)),
      record('focus.cancelled', local(2026, 9, 4, 14, 10), { durationMinutes: 10 }),
    ], september);

    expect(stats.focusSessions).toBe(1);
    expect(stats.focusMinutes).toBe(35);
  });

  it('nets habit check-ins and counts completed goals', () => {
    const stats = calculateStats([
      record('habit.completed', local(2026, 9, 5, 7)),
      record('habit.completed', local(2026, 9, 6, 7)),
      record('habit.reopened', local(2026, 9, 6, 8)),
      record('goal.progressed', local(2026, 9, 6, 9), { value: 3 }),
      record('goal.completed', local(2026, 9, 6, 10)),
    ], september);

    expect(stats.habitCheckIns).toBe(1);
    expect(stats.goalsCompleted).toBe(1);
    expect(calculateStats([record('habit.reopened', local(2026, 9, 6, 8))], september).habitCheckIns).toBe(0);
  });

  it('ignores unknown event types, seeded records and unreadable timestamps', () => {
    const stats = calculateStats([
      record('task.archived', local(2026, 9, 2, 10), { durationMinutes: 30 }),
      record('task.completed', local(2026, 9, 2, 11), { durationMinutes: 30, seeded: true }),
      record('focus.completed', local(2026, 9, 2, 12), { durationMinutes: 25, seeded: true }),
      record('task.completed', 'not-a-date', { durationMinutes: 30 }),
    ], september);

    expect(stats).toMatchObject({
      tasksCompleted: 0,
      completedMinutes: 0,
      focusSessions: 0,
      focusMinutes: 0,
      categories: [],
      folders: [],
      partialHistory: true,
    });
  });

  it('builds one daily entry per local calendar day, including days without activity', () => {
    const week = resolveStatsPeriod('week', september10);
    const stats = calculateStats([
      record('task.completed', local(2026, 9, 7, 23, 30), { durationMinutes: 40 }),
      record('task.completed', local(2026, 9, 8, 0, 0), { durationMinutes: 20 }),
      record('task.reopened', local(2026, 9, 8, 0, 5), { durationMinutes: 50 }),
      record('focus.cancelled', local(2026, 9, 10, 18), { durationMinutes: 15 }),
      record('block.created', local(2026, 9, 13, 23, 59), { durationMinutes: 60 }),
      record('block.created', local(2026, 9, 14, 0, 0), { durationMinutes: 60 }),
    ], week);

    expect(stats.daily).toEqual([
      { date: '2026-09-07', tasksCompleted: 1, focusMinutes: 0, plannedMinutes: 0, completedMinutes: 40 },
      { date: '2026-09-08', tasksCompleted: 0, focusMinutes: 0, plannedMinutes: 0, completedMinutes: -30 },
      { date: '2026-09-09', tasksCompleted: 0, focusMinutes: 0, plannedMinutes: 0, completedMinutes: 0 },
      { date: '2026-09-10', tasksCompleted: 0, focusMinutes: 15, plannedMinutes: 0, completedMinutes: 0 },
      { date: '2026-09-11', tasksCompleted: 0, focusMinutes: 0, plannedMinutes: 0, completedMinutes: 0 },
      { date: '2026-09-12', tasksCompleted: 0, focusMinutes: 0, plannedMinutes: 0, completedMinutes: 0 },
      { date: '2026-09-13', tasksCompleted: 0, focusMinutes: 0, plannedMinutes: 60, completedMinutes: 0 },
    ]);
    expect(stats.daily.reduce((total, day) => total + day.completedMinutes, 0)).toBe(stats.completedMinutes);
    expect(calculateStats([], september).daily).toHaveLength(30);
    expect(calculateStats([], resolveStatsPeriod('today', september10)).daily.map((day) => day.date)).toEqual(['2026-09-10']);
  });

  // Só protegem o horário de verão com TZ=Europe/Berlin (dias de 23 h em 2026-03-29 e de 25 h em
  // 2026-10-25); em qualquer outro fuso continuam valendo.
  it('keeps one daily entry per calendar day across daylight saving changes', () => {
    const springPeriod = custom('2026-03-28', '2026-03-30');
    expect(springPeriod.start).toBe(new Date(2026, 2, 28).toISOString());
    expect(springPeriod.endExclusive).toBe(new Date(2026, 2, 31).toISOString());
    const springForward = calculateStats([
      record('task.completed', new Date(2026, 2, 29, 23, 30).toISOString(), { durationMinutes: 10 }),
    ], springPeriod);
    expect(springForward.daily.map((day) => day.date)).toEqual(['2026-03-28', '2026-03-29', '2026-03-30']);
    expect(springForward.daily[1]).toMatchObject({ date: '2026-03-29', tasksCompleted: 1, completedMinutes: 10 });

    const monday = new Date(2026, 9, 19);
    const nextMonday = new Date(2026, 9, 26);
    const fallBackPeriod = resolveStatsPeriod('week', new Date(2026, 9, 25, 12));
    expect(fallBackPeriod).toEqual({ start: monday.toISOString(), endExclusive: nextMonday.toISOString(), preset: 'week' });
    const fallBackWeek = calculateStats([
      record('task.completed', new Date(2026, 9, 25, 23, 30).toISOString(), { durationMinutes: 20 }),
    ], fallBackPeriod);
    expect(fallBackWeek.daily.map((day) => day.date)).toEqual([
      '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25',
    ]);
    expect(fallBackWeek.daily[6]).toEqual({ date: '2026-10-25', tasksCompleted: 1, focusMinutes: 0, plannedMinutes: 0, completedMinutes: 20 });
    expect(fallBackWeek.tasksCompleted).toBe(1);

    const beforeDst = previousPeriod(resolveStatsPeriod('week', new Date(2026, 2, 31, 12)));
    const previousStart = new Date(beforeDst.start);
    expect([previousStart.getDay(), previousStart.getHours(), previousStart.getDate()]).toEqual([1, 0, 23]);
    expect(beforeDst.endExclusive).toBe(local(2026, 3, 30));
  });

  it('distributes signed task deltas by category and normalized folder, with no folder last on ties', () => {
    const stats = calculateStats([
      record('task.completed', local(2026, 9, 2, 9), { durationMinutes: 30, category: 'work', folder: ' Estúdio ' }),
      record('task.completed', local(2026, 9, 2, 10), { durationMinutes: 20, category: 'work', folder: 'Estu\u0301dio' }),
      record('task.completed', local(2026, 9, 2, 11), { durationMinutes: 50, category: 'learning' }),
      record('task.completed', local(2026, 9, 2, 12), { durationMinutes: 10, folder: '   ' }),
      record('task.completed', local(2026, 9, 2, 13), { durationMinutes: 15, category: 'wellbeing', folder: 'Casa' }),
      record('task.reopened', local(2026, 9, 2, 14), { durationMinutes: 15, category: 'wellbeing', folder: 'Casa' }),
      record('task.reopened', local(2026, 9, 2, 15), { durationMinutes: 5, category: 'break', folder: 'Casa' }),
      record('focus.completed', local(2026, 9, 2, 16), { durationMinutes: 25, category: 'important', folder: 'Foco' }),
      record('task.completed', local(2026, 9, 2, 17), { durationMinutes: 20, category: 'important', folder: 'Foco' }),
      record('task.reopened', local(2026, 9, 2, 18), { durationMinutes: 15, category: 'important', folder: 'Foco' }),
    ], september);

    expect(stats.categories).toEqual([
      { key: 'work', tasksCompleted: 2, minutes: 50 },
      { key: 'learning', tasksCompleted: 1, minutes: 50 },
      { key: 'none', tasksCompleted: 1, minutes: 10 },
      { key: 'important', tasksCompleted: 0, minutes: 5 },
      { key: 'break', tasksCompleted: -1, minutes: -5 },
    ]);
    expect(stats.folders).toEqual([
      { key: 'Estúdio', tasksCompleted: 2, minutes: 50 },
      { key: NO_FOLDER, tasksCompleted: 2, minutes: 60 },
      { key: 'Foco', tasksCompleted: 0, minutes: 5 },
      { key: 'Casa', tasksCompleted: -1, minutes: -5 },
    ]);
  });

  it('marks partial history when the ledger is empty or starts after the period start', () => {
    const week = resolveStatsPeriod('week', september10);

    expect(calculateStats([], week).partialHistory).toBe(true);
    expect(calculateStats([record('goal.completed', local(2026, 9, 8, 12))], week).partialHistory).toBe(true);
    expect(calculateStats([record('goal.completed', local(2026, 9, 7, 0, 0))], week).partialHistory).toBe(false);
    expect(calculateStats([
      record('goal.completed', local(2026, 9, 12, 12)),
      record('habit.completed', local(2026, 8, 1, 12)),
    ], week).partialHistory).toBe(false);
  });

  it('proves earlier history with valid unknown event types but not with seeded or malformed records', () => {
    const week = resolveStatsPeriod('week', september10);
    const inside = record('goal.completed', local(2026, 9, 8, 12));

    expect(calculateStats([inside, record('task.archived', local(2026, 9, 1, 12))], week).partialHistory).toBe(false);
    expect(calculateStats([inside, record('task.completed', local(2026, 9, 1, 12), { seeded: true })], week).partialHistory).toBe(true);
    expect(calculateStats([inside, record('Not A Type', local(2026, 9, 1, 12))], week).partialHistory).toBe(true);
  });

  it('returns the period it was calculated for', () => {
    expect(calculateStats([], september).period).toEqual(september);
  });
});

describe('compareStats', () => {
  it('subtracts the previous period from the current one per metric', () => {
    const current = resolveStatsPeriod('week', september10);
    const previous = previousPeriod(current);
    const records = [
      record('task.completed', local(2026, 9, 8, 9), { durationMinutes: 30 }),
      record('task.completed', local(2026, 9, 8, 10), { durationMinutes: 30 }),
      record('block.created', local(2026, 9, 8, 8), { durationMinutes: 120 }),
      record('focus.completed', local(2026, 9, 9, 9), { durationMinutes: 25 }),
      record('habit.completed', local(2026, 9, 9, 7)),
      record('task.completed', local(2026, 9, 1, 9), { durationMinutes: 90 }),
      record('block.created', local(2026, 9, 1, 8), { durationMinutes: 60 }),
      record('focus.completed', local(2026, 9, 2, 9), { durationMinutes: 25 }),
      record('focus.cancelled', local(2026, 9, 2, 10), { durationMinutes: 5 }),
      record('goal.completed', local(2026, 9, 3, 9)),
    ];

    expect(compareStats(calculateStats(records, current), calculateStats(records, previous))).toEqual({
      tasksCompleted: 1,
      plannedMinutes: 60,
      completedMinutes: -30,
      focusSessions: 0,
      focusMinutes: -5,
      habitCheckIns: 1,
      goalsCompleted: -1,
    });
  });
});

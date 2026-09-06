import { describe, expect, it } from 'vitest';
import { expandRecurrence, durationMinutes, toDateKey } from '../schedule';
import type { RecurrenceRule, ScheduleBlock } from '../models';

describe('schedule domain', () => {
  it('calculates exact duration for a block', () => {
    const block: ScheduleBlock = {
      id: 'lunch', title: 'Almoço', category: 'break',
      start: '2026-09-07T12:00:00-03:00', end: '2026-09-07T14:00:00-03:00',
    };
    expect(durationMinutes(block)).toBe(120);
  });

  it('expands selected weekdays with each day time', () => {
    const rule: RecurrenceRule = {
      frequency: 'weekly', weekdays: [2, 3],
      timesByWeekday: { 2: '09:00', 3: '20:00' },
      startDate: '2026-09-07', endDate: '2026-09-20',
    };
    expect(expandRecurrence(rule, '2026-09-07', '2026-09-20')).toEqual([
      '2026-09-08T09:00:00-03:00', '2026-09-09T20:00:00-03:00',
      '2026-09-15T09:00:00-03:00', '2026-09-16T20:00:00-03:00',
    ]);
  });

  it('uses local calendar dates without shifting the day', () => {
    expect(toDateKey('2026-09-08T09:00:00-03:00')).toBe('2026-09-08');
  });
});

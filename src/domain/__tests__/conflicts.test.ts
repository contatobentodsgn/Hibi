import { describe, expect, it } from 'vitest';
import { findConflicts, validateScheduleBlock } from '../conflicts';
import type { ScheduleBlock } from '../models';

const block = (id: string, start: string, end: string, category: ScheduleBlock['category'] = 'work'): ScheduleBlock => ({ id, title: id, start, end, category });

describe('schedule conflicts', () => {
  it('blocks overlapping work', () => {
    const proposed = block('Post 2', '2026-09-07T10:00:00-03:00', '2026-09-07T11:00:00-03:00');
    const existing = [block('Post 1', '2026-09-07T09:30:00-03:00', '2026-09-07T10:30:00-03:00')];
    expect(findConflicts(proposed, existing)[0].severity).toBe('hard');
  });

  it('blocks work during lunch and walking', () => {
    const lunch = block('Almoço', '2026-09-07T12:00:00-03:00', '2026-09-07T14:00:00-03:00', 'break');
    const work = block('Post 3', '2026-09-07T13:00:00-03:00', '2026-09-07T14:00:00-03:00');
    expect(validateScheduleBlock(work, [lunch]).valid).toBe(false);
  });

  it('allows adjacent blocks with no overlap', () => {
    const first = block('Post 1', '2026-09-07T09:00:00-03:00', '2026-09-07T10:00:00-03:00');
    const second = block('Post 2', '2026-09-07T10:00:00-03:00', '2026-09-07T11:00:00-03:00');
    expect(findConflicts(second, [first])).toEqual([]);
  });
});

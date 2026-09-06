import { describe, expect, it } from 'vitest';
import { findReviewIssues } from '../review';
import type { ScheduleBlock, Task } from '../models';

const task = (id: string, status: Task['status'] = 'open'): Task => ({
  id,
  title: id,
  durationMinutes: 30,
  category: 'work',
  status,
});

const block = (id: string, title: string, start: string): ScheduleBlock => ({
  id,
  title,
  start,
  end: `${start.slice(0, 11)}${String(Number(start.slice(11, 13)) + 1).padStart(2, '0')}:00-03:00`,
  category: 'work',
});

describe('findReviewIssues', () => {
  it('finds open tasks without a scheduled block and ignores completed tasks', () => {
    const issues = findReviewIssues({
      tasks: [task('write', 'open'), task('unplanned', 'open'), task('done', 'completed')],
      blocks: [{ ...block('scheduled', 'write', '2026-09-07T09:00'), taskId: 'write' }],
    });

    expect(issues.unscheduledTasks.map((item) => item.id)).toEqual(['unplanned']);
    expect(issues.unscheduledTaskCount).toBe(1);
  });

  it('groups same-title blocks on the same date as duplicate-looking blocks', () => {
    const issues = findReviewIssues({
      tasks: [],
      blocks: [
        block('one', 'Study', '2026-09-07T09:00'),
        block('two', 'Study', '2026-09-07T14:00'),
        block('three', 'Study', '2026-09-08T09:00'),
      ],
    });

    expect(issues.duplicateBlockGroups).toHaveLength(1);
    expect(issues.duplicateBlockGroups[0].map((item) => item.id)).toEqual(['one', 'two']);
    expect(issues.duplicateBlockCount).toBe(2);
  });
});

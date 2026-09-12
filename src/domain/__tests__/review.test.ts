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
  end: `${start.slice(0, 11)}${String(Number(start.slice(11, 13)) + 1).padStart(2, '0')}:00`,
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

  it('suggests an exact duplicate task group with human-readable evidence', () => {
    const issues = findReviewIssues({
      tasks: [
        { ...task('one'), title: '  Post  Café  ', folder: 'Bento', deadline: '2026-09-14T10:00', durationMinutes: 60 },
        { ...task('two'), title: 'post cafe', folder: 'Bento', deadline: '2026-09-14T10:00', durationMinutes: 60 },
      ],
      blocks: [],
      now: new Date(2026, 8, 12, 12),
    });

    expect(issues.suggestions).toEqual([expect.objectContaining({ kind: 'duplicate_task', taskIds: ['one', 'two'], evidence: expect.arrayContaining(['same title', 'same folder', 'same duration', 'same deadline']) })]);
  });

  it('does not call planned repeated work a duplicate task group', () => {
    const issues = findReviewIssues({
      tasks: [
        { ...task('one'), title: 'Daily standup', folder: 'Bento', durationMinutes: 30 },
        { ...task('two'), title: 'Daily standup', folder: 'Bento', durationMinutes: 30 },
      ],
      blocks: [
        { ...block('one-block', 'Daily standup', '2026-09-14T09:00'), taskId: 'one' },
        { ...block('two-block', 'Daily standup', '2026-09-15T09:00'), taskId: 'two' },
      ],
    });

    expect(issues.suggestions.filter((suggestion) => suggestion.kind === 'duplicate_task')).toEqual([]);
  });

  it('does not group near matches that differ in folder, category, duration or deadline', () => {
    const issues = findReviewIssues({
      tasks: [
        { ...task('reference'), title: 'Client proposal', folder: 'Bento', category: 'work', durationMinutes: 30, deadline: '2026-09-14T10:00' },
        { ...task('folder'), title: 'Client proposal', folder: 'Clients', category: 'work', durationMinutes: 30, deadline: '2026-09-14T10:00' },
        { ...task('category'), title: 'Client proposal', folder: 'Bento', category: 'important', durationMinutes: 30, deadline: '2026-09-14T10:00' },
        { ...task('duration'), title: 'Client proposal', folder: 'Bento', category: 'work', durationMinutes: 45, deadline: '2026-09-14T10:00' },
        { ...task('deadline'), title: 'Client proposal', folder: 'Bento', category: 'work', durationMinutes: 30, deadline: '2026-09-15T10:00' },
      ],
      blocks: [],
      now: new Date(2026, 8, 12, 12),
    });

    expect(issues.suggestions.filter((suggestion) => suggestion.kind === 'duplicate_task')).toEqual([]);
  });

  it('suggests an urgent open task without a schedule but excludes paused, completed, distant and undated tasks', () => {
    const issues = findReviewIssues({
      tasks: [
        { ...task('urgent'), title: 'Send proposal', durationMinutes: 60, deadline: '2026-09-14T10:00' },
        { ...task('paused', 'paused'), durationMinutes: 60, deadline: '2026-09-14T10:00' },
        { ...task('done', 'completed'), durationMinutes: 60, deadline: '2026-09-14T10:00' },
        { ...task('distant'), durationMinutes: 60, deadline: '2026-10-20T10:00' },
        { ...task('undated'), durationMinutes: 60 },
        { ...task('invalid-date'), durationMinutes: 60, deadline: '2026-09-31T10:00' },
      ],
      blocks: [],
      now: new Date(2026, 8, 12, 12),
    });

    expect(issues.suggestions).toEqual([expect.objectContaining({ kind: 'missing_schedule', taskIds: ['urgent'], evidence: expect.arrayContaining(['60 min', expect.stringContaining('deadline')]) })]);
  });
});

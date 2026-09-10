import { describe, expect, it } from 'vitest';
import { createActivityRecord, type ActivityInput } from '../activity';
import { blockActivity, focusActivity, goalProgressActivities, habitCompletionActivity, taskStatusActivity } from '../activity-events';
import type { Goal, Habit, ScheduleBlock, Task } from '../models';

// Horários locais: o teste passa em qualquer fuso.
const at = new Date(2026, 8, 10, 14, 30).toISOString();
const task: Task = { id: 'task-1', title: 'Post 1', durationMinutes: 45, category: 'work', folder: 'Kabrito', status: 'open' };
const habit: Habit = { id: 'habit-1', title: 'Ler', frequency: 'daily', targetPerWeek: 7, completedDates: ['2026-09-09'], status: 'open' };
const goal: Goal = { id: 'goal-1', title: 'Livros', target: 10, current: 3, status: 'open' };
const block: ScheduleBlock = { id: 'block-1', title: 'Roteiro', start: new Date(2026, 8, 10, 9).toISOString(), end: new Date(2026, 8, 10, 10, 30).toISOString(), category: 'learning' };

const accepted = (input: ActivityInput | null) => {
  if (input === null) throw new Error('Expected an activity input');
  expect(() => createActivityRecord(input)).not.toThrow();
  return input;
};

describe('taskStatusActivity', () => {
  it('records a completion with the task snapshot', () => {
    expect(accepted(taskStatusActivity(task, 'completed', at))).toEqual({ type: 'task.completed', at, entityType: 'task', entityId: 'task-1', title: 'Post 1', durationMinutes: 45, category: 'work', folder: 'Kabrito' });
  });

  it('treats a task without status as open', () => {
    const { status: _status, ...withoutStatus } = task;
    expect(taskStatusActivity(withoutStatus, 'completed', at)?.type).toBe('task.completed');
  });

  it.each(['open', 'paused'] as const)('records a reopen when a completed task becomes %s', (next) => {
    expect(accepted(taskStatusActivity({ ...task, status: 'completed' }, next, at))).toMatchObject({ type: 'task.reopened', entityId: 'task-1', durationMinutes: 45 });
  });

  it.each([
    ['completed', 'completed'],
    ['open', 'open'],
    ['open', 'paused'],
    ['paused', 'open'],
  ] as const)('records nothing from %s to %s', (from, to) => {
    expect(taskStatusActivity({ ...task, status: from }, to, at)).toBeNull();
  });

  it('omits an empty folder', () => {
    expect(taskStatusActivity({ ...task, folder: '' }, 'completed', at)).not.toHaveProperty('folder');
    const { folder: _folder, ...withoutFolder } = task;
    expect(taskStatusActivity(withoutFolder, 'completed', at)).not.toHaveProperty('folder');
  });

  it('keeps an overlong title inside the ledger limit', () => {
    const input = accepted(taskStatusActivity({ ...task, title: 'a'.repeat(300) }, 'completed', at));
    expect(input.title).toHaveLength(240);
  });
});

describe('habitCompletionActivity', () => {
  it('records a check-in only when the date was not completed yet', () => {
    expect(accepted(habitCompletionActivity(habit, '2026-09-10', true, at))).toEqual({ type: 'habit.completed', at, entityType: 'habit', entityId: 'habit-1', title: 'Ler' });
    expect(habitCompletionActivity(habit, '2026-09-09', true, at)).toBeNull();
  });

  it('records a reopen only when the date was completed', () => {
    expect(accepted(habitCompletionActivity(habit, '2026-09-09', false, at))).toEqual({ type: 'habit.reopened', at, entityType: 'habit', entityId: 'habit-1', title: 'Ler' });
    expect(habitCompletionActivity(habit, '2026-09-10', false, at)).toBeNull();
  });
});

describe('goalProgressActivities', () => {
  it('records progress with the new value', () => {
    const inputs = goalProgressActivities(goal, { ...goal, current: 4 }, at);
    expect(inputs).toEqual([{ type: 'goal.progressed', at, entityType: 'goal', entityId: 'goal-1', title: 'Livros', value: 4 }]);
    inputs.forEach(accepted);
  });

  it('also records the completion when the status becomes completed', () => {
    const inputs = goalProgressActivities(goal, { ...goal, current: 10, status: 'completed' }, at);
    expect(inputs.map((input) => input.type)).toEqual(['goal.progressed', 'goal.completed']);
    expect(inputs[1]).toEqual({ type: 'goal.completed', at, entityType: 'goal', entityId: 'goal-1', title: 'Livros' });
    inputs.forEach(accepted);
  });

  it('records nothing when neither progress nor status changed', () => {
    expect(goalProgressActivities(goal, { ...goal }, at)).toEqual([]);
    const done = { ...goal, current: 10, status: 'completed' as const };
    expect(goalProgressActivities(done, { ...done }, at)).toEqual([]);
  });

  it('records a regression as progress without a new completion', () => {
    const done = { ...goal, current: 10, status: 'completed' as const };
    expect(goalProgressActivities(done, { ...goal, current: 8, status: 'open' }, at)).toEqual([{ type: 'goal.progressed', at, entityType: 'goal', entityId: 'goal-1', title: 'Livros', value: 8 }]);
  });
});

describe('blockActivity', () => {
  it.each(['created', 'deleted'] as const)('records a %s block with its planned minutes', (kind) => {
    expect(accepted(blockActivity(kind, block, at))).toEqual({ type: `block.${kind}`, at, entityType: 'block', entityId: 'block-1', title: 'Roteiro', durationMinutes: 90, category: 'learning' });
  });

  it('counts whole minutes and never goes below zero', () => {
    const partial = { ...block, end: new Date(2026, 8, 10, 9, 20, 40).toISOString() };
    expect(blockActivity('created', partial, at).durationMinutes).toBe(20);
    const inverted = { ...block, end: new Date(2026, 8, 10, 8).toISOString() };
    expect(accepted(blockActivity('created', inverted, at)).durationMinutes).toBe(0);
    expect(accepted(blockActivity('created', { ...block, end: 'invalid' }, at)).durationMinutes).toBe(0);
  });
});

describe('focusActivity', () => {
  it.each(['started', 'paused', 'resumed'] as const)('records %s without minutes', (type) => {
    expect(accepted(focusActivity(type, 12, at))).toEqual({ type: `focus.${type}`, at, entityType: 'focus' });
  });

  it.each(['completed', 'cancelled'] as const)('records %s with the measured minutes', (type) => {
    expect(accepted(focusActivity(type, 25, at))).toEqual({ type: `focus.${type}`, at, entityType: 'focus', durationMinutes: 25 });
  });

  it('omits minutes that are missing or invalid', () => {
    expect(accepted(focusActivity('cancelled', undefined, at))).not.toHaveProperty('durationMinutes');
    expect(accepted(focusActivity('completed', -3, at))).not.toHaveProperty('durationMinutes');
  });
});

import { describe, expect, it } from 'vitest';
import { deriveGoalsDirection, deriveHabitsRhythm } from '../progress-rhythm';

describe('progress atelier selectors', () => {
  it('derives today completion and longest current habit streak without mutation', () => {
    const habits = [
      { id: 'one', title: 'Read', frequency: 'daily' as const, targetPerWeek: 7, completedDates: ['2026-09-13', '2026-09-14'] },
      { id: 'two', title: 'Walk', frequency: 'weekly' as const, targetPerWeek: 3, completedDates: ['2026-09-11'] },
    ];
    expect(deriveHabitsRhythm(habits, '2026-09-14')).toEqual({ total: 2, completedToday: 1, longestStreak: 2, inProgress: 1 });
    expect(habits.map((habit) => habit.id)).toEqual(['one', 'two']);
  });

  it('selects the open goal closest to completion', () => {
    const goals = [
      { id: 'far', title: 'Read', target: 10, current: 2 },
      { id: 'near', title: 'Ship', target: 10, current: 9 },
      { id: 'done', title: 'Done', target: 10, current: 10 },
    ];
    expect(deriveGoalsDirection(goals)).toMatchObject({ total: 3, completed: 1, active: 2, next: goals[1] });
  });
});

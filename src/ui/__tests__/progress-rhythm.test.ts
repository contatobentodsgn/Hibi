import { describe, expect, it } from 'vitest';
import { deriveGoalsDirection, deriveHabitsRhythm } from '../progress-rhythm';

describe('progress atelier selectors', () => {
  it('derives today completion and longest current habit streak without mutation', () => {
    const habits = [
      { id: 'one', title: 'Read', frequency: 'daily' as const, targetPerWeek: 7, completedDates: ['2026-09-13', '2026-09-14'] },
      { id: 'two', title: 'Walk', frequency: 'weekly' as const, targetPerWeek: 3, completedDates: ['2026-09-11'] },
    ];
    expect(deriveHabitsRhythm(habits, '2026-09-14')).toEqual({ total: 2, completedToday: 1, longestStreak: 2, pending: 1 });
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

  it('a sequência exige dias consecutivos, e não a soma dos dias marcados', () => {
    const comBuraco = [{ id: 'gap', title: 'Stretch', frequency: 'daily' as const, targetPerWeek: 7, completedDates: ['2026-09-01', '2026-09-14'] }];

    expect(deriveHabitsRhythm(comBuraco, '2026-09-14').longestStreak).toBe(1);
  });

  it('um hábito semanal já cumprido na semana não fica pendente o resto dela', () => {
    const semanal = [{ id: 'walk', title: 'Walk', frequency: 'weekly' as const, targetPerWeek: 2, completedDates: ['2026-09-14', '2026-09-15'] }];

    // Quarta-feira, com as duas caminhadas da semana feitas segunda e terça: nada mais a fazer.
    expect(deriveHabitsRhythm(semanal, '2026-09-16')).toEqual({ total: 1, completedToday: 0, longestStreak: 0, pending: 0 });
    // Faltando uma, ele volta a contar como pendente mesmo sem ter sido marcado hoje.
    expect(deriveHabitsRhythm([{ ...semanal[0], completedDates: ['2026-09-14'] }], '2026-09-16').pending).toBe(1);
  });
});

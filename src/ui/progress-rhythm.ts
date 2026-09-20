import { localDateKey, localNoon } from '../domain/date-context';
import type { Goal, Habit } from '../domain/models';

const isCompletedGoal = (goal: Goal) => goal.status === 'completed' || goal.current >= goal.target;

function weekDates(dateKeyValue: string): string[] {
  const date = localNoon(dateKeyValue);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(date);
    current.setDate(date.getDate() + index);
    return localDateKey(current);
  });
}

/** Dias consecutivos concluídos terminando em `today`, contados para trás pelo calendário local. */
export function streakFor(habit: Habit, today: string): number {
  const completed = new Set(habit.completedDates);
  let streak = 0;
  const cursor = localNoon(today);
  while (completed.has(localDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function progressFor(habit: Habit, today: string): { completed: number; target: number } {
  if (habit.frequency === 'daily') return { completed: habit.completedDates.includes(today) ? 1 : 0, target: 1 };
  const week = new Set(weekDates(today));
  return { completed: habit.completedDates.filter((date) => week.has(date)).length, target: habit.targetPerWeek };
}


export function deriveHabitsRhythm(habits: readonly Habit[], today: string) {
  const completedToday = habits.filter((habit) => habit.completedDates.includes(today)).length;
  // O maior entre os hábitos, e não "a sua sequência": com cinco hábitos, o número é o melhor deles.
  const longestStreak = Math.max(0, ...habits.map((habit) => streakFor(habit, today)));
  // Pendente é quem ainda não cumpriu o período — pela mesma conta da lista. Um hábito semanal de três
  // vezes, já cumprido três vezes, não fica pendente o resto da semana só por não ter sido marcado hoje.
  const pending = habits.filter((habit) => { const progress = progressFor(habit, today); return progress.completed < progress.target; }).length;
  return { total: habits.length, completedToday, longestStreak, pending };
}

export function deriveGoalsDirection(goals: readonly Goal[]) {
  const completed = goals.filter(isCompletedGoal).length;
  const activeGoals = goals.filter((goal) => !isCompletedGoal(goal));
  const ordered = [...activeGoals].sort((left, right) => (right.current / Math.max(right.target, 1)) - (left.current / Math.max(left.target, 1)));
  return { total: goals.length, completed, active: activeGoals.length, next: ordered[0] ?? null };
}

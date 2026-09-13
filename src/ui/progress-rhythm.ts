import { localDateKey, localNoon } from '../domain/date-context';
import type { Goal, Habit } from '../domain/models';

const isCompletedGoal = (goal: Goal) => goal.status === 'completed' || goal.current >= goal.target;

function currentStreak(habit: Habit, today: string): number {
  const completed = new Set(habit.completedDates);
  const cursor = localNoon(today);
  let length = 0;
  while (completed.has(localDateKey(cursor))) {
    length += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return length;
}

export function deriveHabitsRhythm(habits: readonly Habit[], today: string) {
  const completedToday = habits.filter((habit) => habit.completedDates.includes(today)).length;
  const longestStreak = Math.max(0, ...habits.map((habit) => currentStreak(habit, today)));
  return { total: habits.length, completedToday, longestStreak, inProgress: Math.max(0, habits.length - completedToday) };
}

export function deriveGoalsDirection(goals: readonly Goal[]) {
  const completed = goals.filter(isCompletedGoal).length;
  const activeGoals = goals.filter((goal) => !isCompletedGoal(goal));
  const ordered = [...activeGoals].sort((left, right) => (right.current / Math.max(right.target, 1)) - (left.current / Math.max(left.target, 1)));
  return { total: goals.length, completed, active: activeGoals.length, next: ordered[0] ?? null };
}

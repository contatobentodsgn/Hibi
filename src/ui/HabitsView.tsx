import React from 'react';
import type { Habit, StudyData } from '../domain/models';

type HabitChanges = Partial<Omit<Habit, 'id'>>;
type Props = {
  data: StudyData;
  onCreate: (title: string, frequency?: Habit['frequency'], targetPerWeek?: number) => void;
  onToggleCompletion: (id: string, date: string, completed: boolean) => void;
  onUpdate: (id: string, changes: HabitChanges) => void;
  onDelete: (id: string) => void;
};

const TODAY = '2026-09-07';
const OFFSET = '-03:00';

function dateKey(date: Date): string { return date.toISOString().slice(0, 10); }

function weekDates(dateKeyValue: string): string[] {
  const date = new Date(`${dateKeyValue}T12:00:00${OFFSET}`);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(date);
    current.setDate(date.getDate() + index);
    return dateKey(current);
  });
}

function streakFor(habit: Habit): number {
  const completed = new Set(habit.completedDates);
  let streak = 0;
  const cursor = new Date(`${TODAY}T12:00:00${OFFSET}`);
  while (completed.has(dateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function progressFor(habit: Habit): { completed: number; target: number } {
  if (habit.frequency === 'daily') return { completed: habit.completedDates.includes(TODAY) ? 1 : 0, target: 1 };
  const week = new Set(weekDates(TODAY));
  return { completed: habit.completedDates.filter((date) => week.has(date)).length, target: habit.targetPerWeek };
}

export function HabitsView({ data, onCreate, onToggleCompletion, onUpdate, onDelete }: Props) {
  return <div className="view habits-view">
    <div className="view-heading"><div><p className="eyebrow">RHYTHM LAYER</p><h1>Habits</h1><p className="muted">{data.habits.length} habits · small actions, repeated well</p></div><button className="primary" onClick={() => {
      const title = window.prompt('Nome do hábito');
      if (!title?.trim()) return;
      const frequency = window.prompt('Frequência: daily ou weekly', 'daily')?.trim().toLowerCase();
      const normalizedFrequency = frequency === 'weekly' ? 'weekly' : 'daily';
      const targetInput = normalizedFrequency === 'weekly' ? window.prompt('Quantas vezes por semana?', '3') : null;
      const target = targetInput ? Number(targetInput) : normalizedFrequency === 'daily' ? 7 : 1;
      onCreate(title.trim(), normalizedFrequency, Number.isFinite(target) && target > 0 ? target : 1);
    }}>+ New habit</button></div>
    <section className="list-card">{data.habits.map((habit) => {
      const completedToday = habit.completedDates.includes(TODAY);
      const progress = progressFor(habit);
      const percent = Math.min(100, Math.round((progress.completed / Math.max(progress.target, 1)) * 100));
      return <div className="habit-row" key={habit.id}>
        <button className={`check ${completedToday ? 'checked' : ''}`} aria-label={`${completedToday ? 'Undo' : 'Complete'} ${habit.title} today`} onClick={() => onToggleCompletion(habit.id, TODAY, !completedToday)}>{completedToday ? '✓' : ''}</button>
        <div className="habit-copy"><strong>{habit.title}</strong><span>{habit.frequency === 'daily' ? 'Daily' : `${habit.targetPerWeek} times per week`} · {progress.completed}/{progress.target} this period · {streakFor(habit)} day streak</span><div className="entity-progress"><span style={{ width: `${percent}%` }} /></div></div>
        <button className="icon-button" aria-label={`Edit ${habit.title}`} onClick={() => { const title = window.prompt('Nome do hábito', habit.title); if (title?.trim() && title.trim() !== habit.title) onUpdate(habit.id, { title: title.trim() }); }}>✎</button>
        <button className="icon-button" aria-label={`Delete ${habit.title}`} onClick={() => { if (window.confirm(`Excluir ${habit.title}?`)) onDelete(habit.id); }}>×</button>
      </div>;
    })}{!data.habits.length && <div className="empty-state"><strong>No habits yet</strong><span>Create one small repeatable action to start building your rhythm.</span></div>}</section>
  </div>;
}

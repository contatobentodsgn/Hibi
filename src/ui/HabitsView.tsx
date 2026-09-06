import React, { useState } from 'react';
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
  const [newTitle, setNewTitle] = useState('');
  const [newFrequency, setNewFrequency] = useState<Habit['frequency']>('daily');
  const [newTarget, setNewTarget] = useState('3');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editFrequency, setEditFrequency] = useState<Habit['frequency']>('daily');
  const [editTarget, setEditTarget] = useState('3');
  const submitNewHabit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    const target = newFrequency === 'daily' ? 7 : Number(newTarget);
    onCreate(title, newFrequency, Number.isFinite(target) && target > 0 ? target : 1);
    setNewTitle('');
  };
  const startEditing = (habit: Habit) => {
    setEditingId(habit.id);
    setEditTitle(habit.title);
    setEditFrequency(habit.frequency);
    setEditTarget(String(habit.targetPerWeek));
  };
  const submitEdit = (event: React.FormEvent<HTMLFormElement>, habit: Habit) => {
    event.preventDefault();
    const title = editTitle.trim();
    if (!title) return;
    const target = editFrequency === 'daily' ? 7 : Number(editTarget);
    const changes: HabitChanges = {};
    if (title !== habit.title) changes.title = title;
    if (editFrequency !== habit.frequency) changes.frequency = editFrequency;
    if (editFrequency === 'weekly' && Number.isFinite(target) && target > 0 && target !== habit.targetPerWeek) changes.targetPerWeek = target;
    if (Object.keys(changes).length) onUpdate(habit.id, changes);
    setEditingId(null);
  };
  return <div className="view habits-view">
    <div className="view-heading"><div><p className="eyebrow">RHYTHM LAYER</p><h1>Habits</h1><p className="muted">{data.habits.length} habits · small actions, repeated well</p></div><button className="primary" type="button" onClick={() => document.getElementById('new-habit-title')?.focus()}>+ New habit</button></div>
    <form className="panel" aria-label="Create habit" onSubmit={submitNewHabit}>
      <label htmlFor="new-habit-title">Habit name</label><input id="new-habit-title" aria-label="New habit title" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} required />
      <label htmlFor="new-habit-frequency">Frequency</label><select id="new-habit-frequency" value={newFrequency} onChange={(event) => setNewFrequency(event.target.value as Habit['frequency'])}><option value="daily">Daily</option><option value="weekly">Weekly</option></select>
      {newFrequency === 'weekly' && <label htmlFor="new-habit-target">Times per week<input id="new-habit-target" type="number" min="1" step="1" value={newTarget} onChange={(event) => setNewTarget(event.target.value)} required /></label>}
      <button className="primary" type="submit">Add habit</button>
    </form>
    <section className="list-card">{data.habits.map((habit) => {
      const completedToday = habit.completedDates.includes(TODAY);
      const progress = progressFor(habit);
      const percent = Math.min(100, Math.round((progress.completed / Math.max(progress.target, 1)) * 100));
      return <div className="habit-row" key={habit.id}>
        <button className={`check ${completedToday ? 'checked' : ''}`} aria-label={`${completedToday ? 'Undo' : 'Complete'} ${habit.title} today`} onClick={() => onToggleCompletion(habit.id, TODAY, !completedToday)}>{completedToday ? '✓' : ''}</button>
        {editingId === habit.id ? <form className="habit-copy" aria-label={`Edit ${habit.title}`} onSubmit={(event) => submitEdit(event, habit)}><label htmlFor={`edit-habit-${habit.id}`}>Habit name</label><input id={`edit-habit-${habit.id}`} aria-label={`Edit ${habit.title} name`} value={editTitle} onChange={(event) => setEditTitle(event.target.value)} required /><label htmlFor={`edit-frequency-${habit.id}`}>Frequency</label><select id={`edit-frequency-${habit.id}`} value={editFrequency} onChange={(event) => setEditFrequency(event.target.value as Habit['frequency'])}><option value="daily">Daily</option><option value="weekly">Weekly</option></select>{editFrequency === 'weekly' && <label htmlFor={`edit-target-${habit.id}`}>Times per week<input id={`edit-target-${habit.id}`} type="number" min="1" step="1" value={editTarget} onChange={(event) => setEditTarget(event.target.value)} required /></label>}<div><button className="primary" type="submit">Save</button><button className="outline" type="button" onClick={() => setEditingId(null)}>Cancel</button></div></form> : <div className="habit-copy"><strong>{habit.title}</strong><span>{habit.frequency === 'daily' ? 'Daily' : `${habit.targetPerWeek} times per week`} · {progress.completed}/{progress.target} this period · {streakFor(habit)} day streak</span><div className="entity-progress"><span style={{ width: `${percent}%` }} /></div></div>}
        {editingId !== habit.id && <button className="icon-button" aria-label={`Edit ${habit.title}`} onClick={() => startEditing(habit)}>✎</button>}
        <button className="icon-button" aria-label={`Delete ${habit.title}`} onClick={() => { if (window.confirm(`Excluir ${habit.title}?`)) onDelete(habit.id); }}>×</button>
      </div>;
    })}{!data.habits.length && <div className="empty-state"><strong>No habits yet</strong><span>Create one small repeatable action to start building your rhythm.</span></div>}</section>
  </div>;
}

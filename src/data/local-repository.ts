import type { Goal, Habit, Note, Reminder, ScheduleBlock, StudyData, Task } from '../domain/models';
import { createActivityRecord, isActivityRecord } from '../domain/activity';
import type { ActivityInput, ActivityRecord } from '../domain/activity';
import { folderOf, NO_FOLDER } from '../domain/folders';

type NewTask = Omit<Task, 'id'>;
type NewHabit = Omit<Habit, 'id'>;
type NewGoal = Omit<Goal, 'id'>;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class LocalRepository {
  private readonly seed: StudyData;
  private data: StudyData;
  private readonly now: () => string;

  constructor(seed: StudyData, now: () => string = () => new Date().toISOString()) {
    this.seed = clone(seed);
    this.data = clone(seed);
    this.now = now;
  }

  static fromJson(seed: StudyData, json: string): LocalRepository {
    const repository = new LocalRepository(seed);
    const parsed = JSON.parse(json) as StudyData;
    if (!parsed || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.reminders) || !Array.isArray(parsed.blocks) || !Array.isArray(parsed.telemetry)) throw new Error('Invalid study data');
    const activity = parsed.activity === undefined ? [] : parsed.activity;
    if (!Array.isArray(activity) || !activity.every(isActivityRecord)) throw new Error('Invalid study data');
    const activityIds = new Set<string>();
    for (const record of activity) {
      if (activityIds.has(record.id)) throw new Error(`Duplicate activity id: ${record.id}`);
      activityIds.add(record.id);
    }
    repository.data = {
      ...clone(parsed),
      activity: clone(activity),
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      habits: Array.isArray(parsed.habits) ? parsed.habits : [],
      goals: Array.isArray(parsed.goals) ? parsed.goals : [],
    };
    return repository;
  }

  replace(data: StudyData): void {
    const restored = LocalRepository.fromJson(this.seed, JSON.stringify(data));
    this.data = restored.snapshot();
  }

  snapshot(): StudyData { return clone(this.data); }
  listActivity(): ActivityRecord[] { return clone(this.data.activity); }
  appendActivity(input: ActivityInput): ActivityRecord {
    const record = createActivityRecord(input);
    if (this.data.activity.some((item) => item.id === record.id)) throw new Error(`Duplicate activity id: ${record.id}`);
    this.data.activity.push(record);
    return clone(record);
  }
  listTasks(): Task[] { return clone(this.data.tasks); }
  listReminders(): Reminder[] { return clone(this.data.reminders); }
  listNotes(): Note[] { return clone(this.data.notes); }
  listHabits(): Habit[] { return clone(this.data.habits); }
  getHabit(id: string): Habit | undefined { return this.data.habits.find((habit) => habit.id === id); }
  createHabit(input: NewHabit): Habit {
    const habit = { ...input, id: `habit-${Date.now()}-${this.data.habits.length}` };
    this.data.habits.push(habit);
    return clone(habit);
  }
  updateHabit(id: string, changes: Partial<NewHabit>): Habit {
    const habit = this.getHabit(id);
    if (!habit) throw new Error(`Habit not found: ${id}`);
    Object.assign(habit, changes);
    return clone(habit);
  }
  deleteHabit(id: string): void { this.data.habits = this.data.habits.filter((habit) => habit.id !== id); }
  setHabitCompletion(id: string, date: string, completed: boolean): Habit {
    const habit = this.getHabit(id);
    if (!habit) throw new Error(`Habit not found: ${id}`);
    const dates = new Set(habit.completedDates);
    if (completed) dates.add(date); else dates.delete(date);
    habit.completedDates = [...dates].sort();
    return clone(habit);
  }
  listGoals(): Goal[] { return clone(this.data.goals); }
  getGoal(id: string): Goal | undefined { return this.data.goals.find((goal) => goal.id === id); }
  createGoal(input: NewGoal): Goal {
    const goal = { ...input, id: `goal-${Date.now()}-${this.data.goals.length}` };
    this.data.goals.push(goal);
    return clone(goal);
  }
  updateGoal(id: string, changes: Partial<NewGoal>): Goal {
    const goal = this.getGoal(id);
    if (!goal) throw new Error(`Goal not found: ${id}`);
    Object.assign(goal, changes);
    return clone(goal);
  }
  deleteGoal(id: string): void { this.data.goals = this.data.goals.filter((goal) => goal.id !== id); }
  setGoalProgress(id: string, current: number): Goal {
    const goal = this.getGoal(id);
    if (!goal) throw new Error(`Goal not found: ${id}`);
    goal.current = Math.max(0, Math.min(goal.target, current));
    goal.status = goal.current >= goal.target ? 'completed' : 'open';
    return clone(goal);
  }
  createNote(input: Omit<Note, 'id'>): Note { const note = { ...input, id: `note-${Date.now()}-${this.data.notes.length}` }; this.data.notes.push(note); return clone(note); }
  updateNote(id: string, changes: Partial<Omit<Note, 'id'>>): Note { const note = this.data.notes.find((item) => item.id === id); if (!note) throw new Error(`Note not found: ${id}`); Object.assign(note, changes); return clone(note); }
  deleteNote(id: string): void { this.data.notes = this.data.notes.filter((note) => note.id !== id); }
  listBlocks(): ScheduleBlock[] { return clone(this.data.blocks); }
  getTask(id: string): Task | undefined { return this.data.tasks.find((task) => task.id === id); }
  createTask(input: NewTask): Task {
    const task = { ...input, id: `task-${Date.now()}-${this.data.tasks.length}`, updatedAt: this.now() };
    this.data.tasks.push(task);
    return clone(task);
  }
  updateTask(id: string, changes: Partial<NewTask>): Task {
    const task = this.getTask(id);
    if (!task) throw new Error(`Task not found: ${id}`);
    Object.assign(task, changes, { updatedAt: this.now() });
    return clone(task);
  }
  deleteTask(id: string): void { this.data.tasks = this.data.tasks.filter((task) => task.id !== id); }
  // Aplica uma renomeação já validada por planFolderRename: só itens daquela pasta são tocados;
  // recusa "Sem pasta" e um alvo vazio como guarda extra, caso o chamador não tenha validado antes.
  renameFolder(from: string, to: string): { tasks: number; notes: number } {
    const target = to.normalize('NFC').trim();
    if (from === NO_FOLDER || !target) throw new Error('Invalid folder rename.');
    let tasks = 0;
    let notes = 0;
    for (const task of this.data.tasks) if (folderOf(task) === from) { this.updateTask(task.id, { folder: target }); tasks += 1; }
    for (const note of this.data.notes) if (folderOf(note) === from) { this.updateNote(note.id, { folder: target, updatedAt: this.now() }); notes += 1; }
    return { tasks, notes };
  }
  createReminder(input: Omit<Reminder, 'id'>): Reminder {
    const reminder = { ...input, id: `reminder-${Date.now()}-${this.data.reminders.length}` };
    this.data.reminders.push(reminder);
    return clone(reminder);
  }
  updateReminder(id: string, changes: Partial<Omit<Reminder, 'id'>>): Reminder {
    const reminder = this.data.reminders.find((item) => item.id === id);
    if (!reminder) throw new Error(`Reminder not found: ${id}`);
    Object.assign(reminder, changes);
    return clone(reminder);
  }
  deleteReminder(id: string): void { this.data.reminders = this.data.reminders.filter((item) => item.id !== id); }
  createBlock(input: Omit<ScheduleBlock, 'id'>): ScheduleBlock {
    const block = { ...input, id: `block-${Date.now()}-${this.data.blocks.length}` };
    this.data.blocks.push(block);
    return clone(block);
  }
  updateBlock(id: string, changes: Partial<Omit<ScheduleBlock, 'id'>>): ScheduleBlock {
    const block = this.data.blocks.find((item) => item.id === id);
    if (!block) throw new Error(`Block not found: ${id}`);
    Object.assign(block, changes);
    return clone(block);
  }
  deleteBlock(id: string): void { this.data.blocks = this.data.blocks.filter((item) => item.id !== id); }
  reset(): void { this.data = clone(this.seed); }
  exportJson(): string { return JSON.stringify(this.data, null, 2); }
}

import { beforeEach, describe, expect, it } from 'vitest';
import { createSeedData } from '../seed-data';
import { LocalRepository } from '../local-repository';

describe('LocalRepository', () => {
  let repository: LocalRepository;

  beforeEach(() => { repository = new LocalRepository(createSeedData()); });

  it('seeds the internal study routine with exact fixed commitments', () => {
    const data = repository.snapshot();
    expect(data.blocks.some((b) => b.title === 'Almoço' && b.start.endsWith('T12:00:00-03:00') && b.end.endsWith('T14:00:00-03:00'))).toBe(true);
    expect(data.blocks.some((b) => b.title === 'Aula de inglês' && b.start.endsWith('T21:00:00-03:00'))).toBe(true);
    expect(data.reminders.filter((r) => r.title === 'vaga/inglês - Horizontes')).toHaveLength(1);
  });

  it('supports create, update and delete without losing other entities', () => {
    const task = repository.createTask({ title: 'Estudo', durationMinutes: 60, category: 'work' });
    expect(repository.getTask(task.id)?.title).toBe('Estudo');
    repository.updateTask(task.id, { title: 'Estudo atualizado' });
    expect(repository.getTask(task.id)?.title).toBe('Estudo atualizado');
    repository.deleteTask(task.id);
    expect(repository.getTask(task.id)).toBeUndefined();
    expect(repository.snapshot().blocks.length).toBeGreaterThan(0);
  });

  it('stamps task creation and edits with a local revision while accepting legacy tasks', () => {
    const moments = ['2026-09-09T12:00:00.000Z', '2026-09-09T12:01:00.000Z'];
    const stamped = new LocalRepository(createSeedData(), () => moments.shift() ?? 'unexpected');
    const task = stamped.createTask({ title: 'Sincronizar', durationMinutes: 60, category: 'work' });
    expect(task.updatedAt).toBe('2026-09-09T12:00:00.000Z');
    expect(stamped.updateTask(task.id, { title: 'Sincronizado' }).updatedAt).toBe('2026-09-09T12:01:00.000Z');

    const legacy = LocalRepository.fromJson(createSeedData(), JSON.stringify(createSeedData()));
    expect(legacy.listTasks().some((entry) => entry.updatedAt === undefined)).toBe(true);
  });

  it('exports and resets to a fresh copy of seed data', () => {
    const task = repository.createTask({ title: 'Temporário', durationMinutes: 60, category: 'work' });
    const exported = JSON.parse(repository.exportJson());
    expect(exported.tasks.some((t: { id: string }) => t.id === task.id)).toBe(true);
    repository.reset();
    expect(repository.getTask(task.id)).toBeUndefined();
    expect(repository.snapshot()).toEqual(createSeedData());
  });

  it('starts habits and goals empty and supports their independent CRUD', () => {
    expect(repository.listHabits()).toEqual([]);
    expect(repository.listGoals()).toEqual([]);

    const habit = repository.createHabit({ title: 'Read', frequency: 'daily', targetPerWeek: 7, completedDates: [] });
    expect(repository.getHabit(habit.id)?.title).toBe('Read');
    repository.updateHabit(habit.id, { title: 'Read 20 pages' });
    expect(repository.getHabit(habit.id)?.title).toBe('Read 20 pages');

    const goal = repository.createGoal({ title: 'Finish course', target: 10, current: 0, unit: 'lessons' });
    expect(repository.getGoal(goal.id)?.current).toBe(0);
    repository.updateGoal(goal.id, { title: 'Finish TypeScript course' });
    expect(repository.getGoal(goal.id)?.title).toBe('Finish TypeScript course');

    repository.deleteHabit(habit.id);
    repository.deleteGoal(goal.id);
    expect(repository.listHabits()).toEqual([]);
    expect(repository.listGoals()).toEqual([]);
  });

  it('records habit completion and clamps goal progress', () => {
    const habit = repository.createHabit({ title: 'Walk', frequency: 'daily', targetPerWeek: 7, completedDates: [] });
    repository.setHabitCompletion(habit.id, '2026-09-07', true);
    repository.setHabitCompletion(habit.id, '2026-09-07', true);
    expect(repository.getHabit(habit.id)?.completedDates).toEqual(['2026-09-07']);
    repository.setHabitCompletion(habit.id, '2026-09-07', false);
    expect(repository.getHabit(habit.id)?.completedDates).toEqual([]);

    const goal = repository.createGoal({ title: 'Ship', target: 3, current: 0 });
    expect(repository.setGoalProgress(goal.id, 8).current).toBe(3);
    expect(repository.getGoal(goal.id)?.status).toBe('completed');
    expect(repository.setGoalProgress(goal.id, -2).current).toBe(0);
    expect(repository.getGoal(goal.id)?.status).toBe('open');
  });

  it('loads legacy snapshots without habit or goal collections', () => {
    const legacy = JSON.parse(repository.exportJson()) as Record<string, unknown>;
    delete legacy.habits;
    delete legacy.goals;
    const restored = LocalRepository.fromJson(createSeedData(), JSON.stringify(legacy));
    expect(restored.listHabits()).toEqual([]);
    expect(restored.listGoals()).toEqual([]);
  });

  it('replaces the entire local workspace only after validation', () => {
    const imported = createSeedData();
    imported.tasks[0].title = 'Imported task';
    repository.replace(imported);
    expect(repository.snapshot()).toEqual(imported);
    expect(() => repository.replace({ ...imported, tasks: null as never })).toThrow('Invalid study data');
    expect(repository.snapshot()).toEqual(imported);
  });

  it('renomeia uma pasta só nos itens dela e devolve as contagens', () => {
    repository.createTask({ title: 'Cliente A', durationMinutes: 30, category: 'work', folder: 'Clientes' });
    repository.createNote({ title: 'Briefing', content: '', folder: ' Clientes ', createdAt: '2026-09-10T00:00:00.000Z', updatedAt: '2026-09-10T00:00:00.000Z' });

    expect(repository.renameFolder('Clientes', ' Estúdio ')).toEqual({ tasks: 1, notes: 1 });

    const data = repository.snapshot();
    expect(data.tasks.filter((task) => task.folder === 'Estúdio')).toHaveLength(1);
    expect(data.notes.map((note) => note.folder)).toEqual(['Estúdio']);
    expect(data.tasks.filter((task) => task.folder === 'Bento')).toHaveLength(8);
  });
});

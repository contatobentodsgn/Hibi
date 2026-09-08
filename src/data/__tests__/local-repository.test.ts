import { beforeEach, describe, expect, it } from 'vitest';
import { createSeedData } from '../seed-data';
import { LocalRepository } from '../local-repository';

describe('LocalRepository', () => {
  let repository: LocalRepository;

  beforeEach(() => { repository = new LocalRepository(createSeedData()); });

  it('starts seed data with an empty activity ledger', () => {
    expect(createSeedData().activity).toEqual([]);
  });

  it('appends exactly one cloned activity record', () => {
    const appended = repository.appendActivity({
      id: 'activity-task-1',
      type: 'task.completed',
      at: '2026-09-08T12:00:00.000Z',
      entityType: 'task',
      entityId: 'task-1',
      title: 'Post',
    });

    expect(appended).toEqual({
      id: 'activity-task-1',
      schemaVersion: 1,
      type: 'task.completed',
      at: '2026-09-08T12:00:00.000Z',
      entityType: 'task',
      entityId: 'task-1',
      title: 'Post',
    });
    expect(repository.listActivity()).toEqual([appended]);
  });

  it('protects activity state from returned records and list results', () => {
    const appended = repository.appendActivity({
      id: 'activity-task-1',
      type: 'task.completed',
      at: '2026-09-08T12:00:00.000Z',
      title: 'Original title',
    });
    appended.title = 'Changed append result';
    const listed = repository.listActivity();
    listed[0].title = 'Changed list result';
    listed.push({ ...listed[0], id: 'activity-injected' });

    expect(repository.listActivity()).toEqual([expect.objectContaining({
      id: 'activity-task-1',
      title: 'Original title',
    })]);
  });

  it('rejects malformed imported activity records', () => {
    const imported = createSeedData() as unknown as Record<string, unknown>;
    imported.activity = [{
      id: 'activity-bad',
      schemaVersion: 1,
      type: '../bad',
      at: 'not-a-timestamp',
    }];

    expect(() => LocalRepository.fromJson(createSeedData(), JSON.stringify(imported))).toThrow('Invalid study data');
  });

  it('loads legacy snapshots without activity with an empty ledger', () => {
    const legacy = JSON.parse(repository.exportJson()) as Record<string, unknown>;
    delete legacy.activity;

    const restored = LocalRepository.fromJson(createSeedData(), JSON.stringify(legacy));

    expect(restored.listActivity()).toEqual([]);
  });

  it('rejects duplicate imported and appended activity IDs', () => {
    const record = {
      id: 'activity-duplicate',
      schemaVersion: 1,
      type: 'task.completed',
      at: '2026-09-08T12:00:00.000Z',
    } as const;
    const imported = { ...createSeedData(), activity: [record, record] };

    expect(() => LocalRepository.fromJson(createSeedData(), JSON.stringify(imported))).toThrow('Duplicate activity id: activity-duplicate');

    repository.appendActivity({
      id: record.id,
      type: record.type,
      at: record.at,
    });
    expect(() => repository.appendActivity({
      id: record.id,
      type: record.type,
      at: record.at,
    })).toThrow('Duplicate activity id: activity-duplicate');
    expect(repository.listActivity()).toHaveLength(1);
  });

  it('preserves structurally valid unknown namespaced activity types on import', () => {
    const imported = {
      ...createSeedData(),
      activity: [{
        id: 'activity-future',
        schemaVersion: 1,
        type: 'future.valid',
        at: '2026-09-08T12:00:00.000Z',
      }],
    };

    expect(LocalRepository.fromJson(createSeedData(), JSON.stringify(imported)).listActivity()).toEqual(imported.activity);
  });

  it('rejects unsupported imported activity schema versions', () => {
    const imported = {
      ...createSeedData(),
      activity: [{
        id: 'activity-future-schema',
        schemaVersion: 2,
        type: 'future.valid',
        at: '2026-09-08T12:00:00.000Z',
      }],
    };

    expect(() => LocalRepository.fromJson(createSeedData(), JSON.stringify(imported))).toThrow('Invalid study data');
  });

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
});

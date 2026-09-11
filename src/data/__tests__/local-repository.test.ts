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
    // Relógio injetado (como no teste de carimbo acima) para que o updatedAt da nota renomeada seja
    // uma asserção exata, e não dependa de quando o teste de fato rodou.
    const moments = ['2026-09-10T01:00:00.000Z', '2026-09-10T02:00:00.000Z', '2026-09-10T03:00:00.000Z', '2026-09-10T04:00:00.000Z'];
    const stamped = new LocalRepository(createSeedData(), () => moments.shift() ?? 'unexpected');
    stamped.createTask({ title: 'Cliente A', durationMinutes: 30, category: 'work', folder: 'Clientes' });
    stamped.createNote({ title: 'Briefing', content: '', folder: ' Clientes ', createdAt: '2026-09-10T00:00:00.000Z', updatedAt: '2026-09-10T00:00:00.000Z' });
    stamped.createNote({ title: 'Nota arquivada', content: '', folder: 'Arquivo', createdAt: '2026-09-10T00:00:00.000Z', updatedAt: '2026-09-10T00:00:00.000Z' });
    const semPasta = stamped.createTask({ title: 'Sem pasta', durationMinutes: 30, category: 'work' });

    expect(stamped.renameFolder('Clientes', ' Estúdio ')).toEqual({ tasks: 1, notes: 1 });

    const data = stamped.snapshot();
    expect(data.tasks.filter((task) => task.folder === 'Estúdio')).toHaveLength(1);
    expect(data.tasks.filter((task) => task.folder === 'Bento')).toHaveLength(8);
    expect(data.tasks.find((task) => task.id === semPasta.id)?.folder).toBeUndefined();

    const arquivoNote = data.notes.find((note) => note.title === 'Nota arquivada');
    expect(arquivoNote?.folder).toBe('Arquivo');
    expect(arquivoNote?.updatedAt).toBe('2026-09-10T00:00:00.000Z');

    const renamedNote = data.notes.find((note) => note.title === 'Briefing');
    expect(renamedNote?.folder).toBe('Estúdio');
    expect(renamedNote?.updatedAt).toBe('2026-09-10T04:00:00.000Z');
  });

  it('compara e grava pastas em NFC mesmo quando o item chega em NFD', () => {
    // "Estúdio" colado do macOS chega em NFD (forma decomposta); o `from` digitado pelo usuário, como
    // este literal, chega em NFC (forma composta) — a comparação tem que atravessar essa diferença.
    const from = 'Estúdio'.normalize('NFC');
    const storedFolder = 'Estúdio'.normalize('NFD');
    expect(storedFolder).not.toBe(from);
    repository.createTask({ title: 'Projeto NFD', durationMinutes: 30, category: 'work', folder: storedFolder });

    const to = 'Ateliê'.normalize('NFD');
    const expectedTarget = 'Ateliê'.normalize('NFC');
    expect(to).not.toBe(expectedTarget);

    expect(repository.renameFolder(from, to)).toEqual({ tasks: 1, notes: 0 });

    const renamed = repository.snapshot().tasks.find((task) => task.title === 'Projeto NFD');
    expect(renamed?.folder).toBe(expectedTarget);
  });

  it('recusa renomear "Sem pasta" ou para um nome que fica vazio depois de aparado', () => {
    expect(() => repository.renameFolder('', 'X')).toThrow('Invalid folder rename.');
    expect(() => repository.renameFolder('Clientes', '   ')).toThrow('Invalid folder rename.');
  });

  it('reancora ao carregar só o lembrete semanal cujo dia contradiz a própria recorrência', () => {
    const stored = createSeedData();
    // O que o cálculo antigo gravava a leste de UTC+09: uma terça pedida a partir de segunda 07/09
    // voltava como 07/09, que é segunda — um `at` fora dos dias que o próprio lembrete repete.
    stored.reminders.push({
      id: 'weekly-broken', title: 'Aula de inglês', category: 'important', status: 'open',
      schedule: { at: '2026-09-07T09:00:00-03:00', recurrence: { frequency: 'weekly', weekdays: [2], timesByWeekday: { 2: '09:00' }, startDate: '2026-09-07' } },
    });

    const loaded = LocalRepository.fromJson(createSeedData(), JSON.stringify(stored)).listReminders();

    expect(loaded.find((reminder) => reminder.id === 'weekly-broken')?.schedule.at).toBe('2026-09-08T09:00:00-03:00');
    // O do seed cai numa terça, que está entre os dias que ele repete: sai da carga como entrou.
    expect(loaded.find((reminder) => reminder.id === 'horizontes')).toEqual(createSeedData().reminders[0]);
  });

  it('carrega duas vezes sem mudar nada na segunda', () => {
    const stored = createSeedData();
    stored.reminders.push({
      id: 'weekly-broken', title: 'Aula de inglês', category: 'important', status: 'open',
      schedule: { at: '2026-09-07T09:00:00-03:00', recurrence: { frequency: 'weekly', weekdays: [2], timesByWeekday: { 2: '09:00' }, startDate: '2026-09-07' } },
    });

    const first = LocalRepository.fromJson(createSeedData(), JSON.stringify(stored)).exportJson();
    expect(LocalRepository.fromJson(createSeedData(), first).exportJson()).toBe(first);
  });
});

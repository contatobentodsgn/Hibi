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

  it('exports and resets to a fresh copy of seed data', () => {
    const task = repository.createTask({ title: 'Temporário', durationMinutes: 60, category: 'work' });
    const exported = JSON.parse(repository.exportJson());
    expect(exported.tasks.some((t: { id: string }) => t.id === task.id)).toBe(true);
    repository.reset();
    expect(repository.getTask(task.id)).toBeUndefined();
    expect(repository.snapshot()).toEqual(createSeedData());
  });
});

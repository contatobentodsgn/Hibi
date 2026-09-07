import { describe, expect, it } from 'vitest';
import { createLocalHibiRuntime } from '../local-runtime';
import { LocalRepository } from '../../data/local-repository';
import { createSeedData } from '../../data/seed-data';

describe('local Hibi tool registry', () => {
  it('creates a task only after the runtime confirmation is approved', async () => {
    const repository = new LocalRepository(createSeedData());
    const runtime = createLocalHibiRuntime(repository);
    const pending = await runtime.runTurn({ message: 'crie uma tarefa: revisar roteiro', surface: 'desktop', now: new Date('2026-09-07T09:00:00-03:00') });
    expect(repository.listTasks().some((task) => task.title === 'revisar roteiro')).toBe(false);
    if (!pending.confirmation) throw new Error('Expected confirmation');
    await runtime.confirm(pending.confirmation);
    expect(repository.listTasks().some((task) => task.title === 'revisar roteiro')).toBe(true);
  });

  it('uses real read tools for schedule questions without requiring confirmation', async () => {
    const runtime = createLocalHibiRuntime(new LocalRepository(createSeedData()));
    const result = await runtime.runTurn({ message: 'qual a minha agenda hoje?', surface: 'desktop' });
    expect(result.confirmation).toBeUndefined();
    expect(result.toolResults[0]?.summary).toContain('bloco');
  });

  it('creates a conflict-free schedule block after confirmation', async () => {
    const repository = new LocalRepository(createSeedData()); const runtime = createLocalHibiRuntime(repository);
    const pending = await runtime.runTurn({ message: 'crie um bloco: revisar pauta das 22:00 às 23:00', surface: 'desktop', now: new Date('2026-09-07T09:00:00-03:00') });
    if (!pending.confirmation) throw new Error('Expected confirmation');
    await runtime.confirm(pending.confirmation);
    expect(repository.listBlocks().some((block) => block.title === 'revisar pauta')).toBe(true);
  });
});

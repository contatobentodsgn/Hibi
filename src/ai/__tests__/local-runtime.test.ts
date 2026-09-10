import { describe, expect, it } from 'vitest';
import { createLocalHibiRuntime } from '../local-runtime';
import { HeuristicAiProvider } from '../heuristic-provider';
import { LocalRepository } from '../../data/local-repository';
import { createSeedData } from '../../data/seed-data';
import type { AiProvider } from '../contracts';

const providerFor = (toolCalls: readonly { name: string; arguments: Record<string, unknown> }[]): AiProvider => ({ id: 'test', label: 'Test model', generate: async () => ({ reply: 'Ready', toolCalls: [...toolCalls], notchPresentation: null, providerMetadata: { model: 'test-model' } }) });

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

  it('wires a separate local heuristic fallback under the explicit automatic policy', async () => {
    const remoteFailure = Object.assign(new Error('temporary outage'), { failure: { code: 'unavailable' as const, retryable: true } });
    const remote: AiProvider = { id: 'remote', label: 'Configured remote', generate: async () => { throw remoteFailure; } };
    const fallback = new HeuristicAiProvider();
    const runtime = createLocalHibiRuntime(new LocalRepository(createSeedData()), {}, remote, fallback, 'automatic');

    const result = await runtime.runTurn({ message: 'qual a minha agenda hoje?', surface: 'desktop' });

    expect(result.provider).toMatchObject({ id: 'heuristic', label: 'Hibi local heuristic', fallback: true });
  });

  it('creates a conflict-free schedule block after confirmation', async () => {
    const repository = new LocalRepository(createSeedData()); const runtime = createLocalHibiRuntime(repository);
    const pending = await runtime.runTurn({ message: 'crie um bloco: revisar pauta das 22:00 às 23:00', surface: 'desktop', now: new Date('2026-09-07T09:00:00-03:00') });
    if (!pending.confirmation) throw new Error('Expected confirmation');
    await runtime.confirm(pending.confirmation);
    expect(repository.listBlocks().some((block) => block.title === 'revisar pauta')).toBe(true);
  });

  it('updates a task only after an explicit confirmation', async () => {
    const repository = new LocalRepository(createSeedData()); const task = repository.listTasks()[0]!;
    const runtime = createLocalHibiRuntime(repository, {}, providerFor([{ name: 'task.update', arguments: { id: task.id, title: 'Updated by AI' } }]));

    const pending = await runtime.runTurn({ message: 'Rename it', surface: 'desktop' });
    expect(repository.getTask(task.id)?.title).toBe(task.title);
    if (!pending.confirmation) throw new Error('Expected confirmation');
    await runtime.confirm(pending.confirmation);
    expect(repository.getTask(task.id)?.title).toBe('Updated by AI');
  });

  it('emits a completion event when an approved AI update completes a task', async () => {
    const repository = new LocalRepository(createSeedData()); const task = repository.listTasks()[0]!;
    const completed: string[] = [];
    const runtime = createLocalHibiRuntime(repository, { onTaskCompleted: (title) => completed.push(title) }, providerFor([{ name: 'task.update', arguments: { id: task.id, status: 'completed' } }]));

    const pending = await runtime.runTurn({ message: 'Complete it', surface: 'desktop' });
    if (!pending.confirmation) throw new Error('Expected confirmation');
    await runtime.confirm(pending.confirmation);

    expect(repository.getTask(task.id)?.status).toBe('completed');
    expect(completed).toEqual([task.title]);
  });

  it('deletes a reminder only after an explicit confirmation', async () => {
    const repository = new LocalRepository(createSeedData()); const reminder = repository.listReminders()[0]!;
    const runtime = createLocalHibiRuntime(repository, {}, providerFor([{ name: 'reminder.delete', arguments: { id: reminder.id } }]));

    const pending = await runtime.runTurn({ message: 'Delete it', surface: 'desktop' });
    expect(repository.listReminders().some((item) => item.id === reminder.id)).toBe(true);
    if (!pending.confirmation) throw new Error('Expected confirmation');
    await runtime.confirm(pending.confirmation);
    expect(repository.listReminders().some((item) => item.id === reminder.id)).toBe(false);
  });

  it('interprets local edit and delete commands for every mutable workspace entity', async () => {
    const repository = new LocalRepository(createSeedData());
    const note = repository.createNote({ title: 'Rascunho', content: 'texto', folder: 'Bento', createdAt: '2026-09-07T09:00:00-03:00', updatedAt: '2026-09-07T09:00:00-03:00' });
    const cases: Array<[string, string, () => boolean]> = [
      ['edite tarefa: Kabrito Post 01 para Post revisado', 'exclua tarefa: Post revisado', () => repository.listTasks().some((item) => item.title === 'Post revisado')],
      ['edite lembrete: vaga/inglês - Horizontes para Aviso Horizontes', 'exclua lembrete: Aviso Horizontes', () => repository.listReminders().some((item) => item.title === 'Aviso Horizontes')],
      ['edite bloco: 2026-09-07-09:00 para Bloco revisado', 'exclua bloco: Bloco revisado', () => repository.listBlocks().some((item) => item.title === 'Bloco revisado')],
      ['edite nota: Rascunho para Nota revisada', 'exclua nota: Nota revisada', () => repository.listNotes().some((item) => item.id === note.id && item.title === 'Nota revisada')],
    ];
    const runtime = createLocalHibiRuntime(repository);

    for (const [edit, remove, exists] of cases) {
      const editPending = await runtime.runTurn({ message: edit, surface: 'desktop' });
      expect(editPending.confirmation).toBeDefined();
      expect(exists()).toBe(false);
      await runtime.confirm(editPending.confirmation!);
      expect(exists()).toBe(true);
      const deletePending = await runtime.runTurn({ message: remove, surface: 'desktop' });
      expect(deletePending.confirmation).toBeDefined();
      await runtime.confirm(deletePending.confirmation!);
      expect(exists()).toBe(false);
    }
  });
});

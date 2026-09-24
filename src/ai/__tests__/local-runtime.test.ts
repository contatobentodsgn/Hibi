import { describe, expect, it } from 'vitest';
import { createLocalAssistantRuntime } from '../local-runtime';
import { HeuristicAiProvider } from '../heuristic-provider';
import { LocalRepository } from '../../data/local-repository';
import { createSeedData } from '../../data/seed-data';
import { localDateKey } from '../../domain/date-context';
import type { AiProvider } from '../contracts';
import type { ScheduleBlock, Task } from '../../domain/models';

const providerFor = (toolCalls: readonly { name: string; arguments: Record<string, unknown> }[]): AiProvider => ({ id: 'test', label: 'Test model', generate: async () => ({ reply: 'Ready', toolCalls: [...toolCalls], notchPresentation: null, providerMetadata: { model: 'test-model' } }) });

describe('local Hibi tool registry', () => {
  it('creates a task only after the runtime confirmation is approved', async () => {
    const repository = new LocalRepository(createSeedData());
    const runtime = createLocalAssistantRuntime(repository);
    const pending = await runtime.runTurn({ message: 'crie uma tarefa: revisar roteiro', surface: 'desktop', now: new Date('2026-09-07T09:00:00-03:00') });
    expect(repository.listTasks().some((task) => task.title === 'revisar roteiro')).toBe(false);
    if (!pending.confirmation) throw new Error('Expected confirmation');
    await runtime.confirm(pending.confirmation);
    expect(repository.listTasks().some((task) => task.title === 'revisar roteiro')).toBe(true);
  });

  it('uses real read tools for schedule questions without requiring confirmation', async () => {
    const runtime = createLocalAssistantRuntime(new LocalRepository(createSeedData()));
    const result = await runtime.runTurn({ message: 'qual a minha agenda hoje?', surface: 'desktop' });
    expect(result.confirmation).toBeUndefined();
    expect(result.toolResults[0]?.summary).toContain('bloco');
  });

  it('wires a separate local heuristic fallback under the explicit automatic policy', async () => {
    const remoteFailure = Object.assign(new Error('temporary outage'), { failure: { code: 'unavailable' as const, retryable: true } });
    const remote: AiProvider = { id: 'remote', label: 'Configured remote', generate: async () => { throw remoteFailure; } };
    const fallback = new HeuristicAiProvider();
    const runtime = createLocalAssistantRuntime(new LocalRepository(createSeedData()), {}, remote, fallback, 'automatic');

    const result = await runtime.runTurn({ message: 'qual a minha agenda hoje?', surface: 'desktop' });

    expect(result.provider).toMatchObject({ id: 'heuristic', label: 'Pixano local heuristic', fallback: true });
  });

  it('creates a conflict-free schedule block after confirmation', async () => {
    const repository = new LocalRepository(createSeedData()); const runtime = createLocalAssistantRuntime(repository);
    const pending = await runtime.runTurn({ message: 'crie um bloco: revisar pauta das 22:00 às 23:00', surface: 'desktop', now: new Date('2026-09-07T09:00:00-03:00') });
    if (!pending.confirmation) throw new Error('Expected confirmation');
    await runtime.confirm(pending.confirmation);
    expect(repository.listBlocks().some((block) => block.title === 'revisar pauta')).toBe(true);
  });

  it('grava o bloco pedido em hora de parede, no dia local de quem perguntou', async () => {
    const repository = new LocalRepository(createSeedData()); const runtime = createLocalAssistantRuntime(repository);
    // O runtime entrega `currentTime` em UTC (`toISOString`). "das 22:00 às 23:00" é o relógio de
    // quem pediu: fatiar o texto UTC punha o bloco no dia de Greenwich, que a leste e a oeste não é
    // o mesmo dia. O dia sai de `date-context`, e nada de offset é gravado.
    const now = new Date('2026-09-07T09:00:00-03:00');
    const pending = await runtime.runTurn({ message: 'crie um bloco: revisar pauta das 22:00 às 23:00', surface: 'desktop', now });
    if (!pending.confirmation) throw new Error('Expected confirmation');
    await runtime.confirm(pending.confirmation);

    const created = repository.listBlocks().find((block) => block.title === 'revisar pauta');
    expect(created?.start).toBe(`${localDateKey(now)}T22:00:00`);
    expect(created?.end).toBe(`${localDateKey(now)}T23:00:00`);
  });

  it('normaliza para hora de parede o instante com fuso que vier de um provedor externo', async () => {
    const repository = new LocalRepository(createSeedData());
    const runtime = createLocalAssistantRuntime(repository, {}, providerFor([{ name: 'block.create', arguments: { title: 'importado', start: '2027-03-04T12:00:00Z', end: '2027-03-04T13:00:00Z', category: 'work' } }]));

    const pending = await runtime.runTurn({ message: 'Do it', surface: 'desktop' });
    if (!pending.confirmation) throw new Error('Expected confirmation');
    await runtime.confirm(pending.confirmation);

    // Nada com offset entra no workspace pela porta do assistente: vira a hora de parede que a tela
    // mostraria para aquele instante, do mesmo jeito que a migração do dado já gravado faz.
    expect(repository.listBlocks().find((block) => block.title === 'importado')).toMatchObject({ start: '2027-03-04T09:00:00', end: '2027-03-04T10:00:00' });
  });

  it('updates a task only after an explicit confirmation', async () => {
    const repository = new LocalRepository(createSeedData()); const task = repository.listTasks()[0]!;
    const runtime = createLocalAssistantRuntime(repository, {}, providerFor([{ name: 'task.update', arguments: { id: task.id, title: 'Updated by AI' } }]));

    const pending = await runtime.runTurn({ message: 'Rename it', surface: 'desktop' });
    expect(repository.getTask(task.id)?.title).toBe(task.title);
    if (!pending.confirmation) throw new Error('Expected confirmation');
    await runtime.confirm(pending.confirmation);
    expect(repository.getTask(task.id)?.title).toBe('Updated by AI');
  });

  const confirmTurn = async (runtime: ReturnType<typeof createLocalAssistantRuntime>) => {
    const pending = await runtime.runTurn({ message: 'Do it', surface: 'desktop' });
    if (!pending.confirmation) throw new Error('Expected confirmation');
    await runtime.confirm(pending.confirmation);
  };

  it('reports the before and after task when an approved AI update completes a task', async () => {
    const repository = new LocalRepository(createSeedData()); const task = repository.listTasks()[0]!;
    repository.updateTask(task.id, { status: 'open' });
    const changes: Array<[Task, Task]> = [];
    const runtime = createLocalAssistantRuntime(repository, { onTaskStatusChanged: (before, after) => changes.push([before, after]) }, providerFor([{ name: 'task.update', arguments: { id: task.id, status: 'completed' } }]));

    await confirmTurn(runtime);

    expect(repository.getTask(task.id)?.status).toBe('completed');
    expect(changes).toHaveLength(1);
    expect(changes[0]![0]).toMatchObject({ id: task.id, title: task.title, status: 'open' });
    expect(changes[0]![1]).toMatchObject({ id: task.id, title: task.title, status: 'completed' });
    // O "antes" é uma cópia: a mutação da ferramenta não pode reescrevê-lo.
    expect(changes[0]![0]).not.toBe(repository.getTask(task.id));
    expect(changes[0]![1]).not.toBe(repository.getTask(task.id));
  });

  it('reports a reopen made through an approved AI update', async () => {
    const repository = new LocalRepository(createSeedData()); const task = repository.listTasks()[0]!;
    repository.updateTask(task.id, { status: 'completed' });
    const changes: Array<[string | undefined, string | undefined]> = [];
    const runtime = createLocalAssistantRuntime(repository, { onTaskStatusChanged: (before, after) => changes.push([before.status, after.status]) }, providerFor([{ name: 'task.update', arguments: { id: task.id, status: 'open' } }]));

    await confirmTurn(runtime);

    expect(changes).toEqual([['completed', 'open']]);
  });

  it('does not report a status change when an approved AI update renames an already completed task', async () => {
    const repository = new LocalRepository(createSeedData()); const task = repository.listTasks()[0]!;
    repository.updateTask(task.id, { status: 'completed' });
    const changes: string[] = [];
    const runtime = createLocalAssistantRuntime(repository, { onTaskStatusChanged: (_before, after) => changes.push(after.id) }, providerFor([{ name: 'task.update', arguments: { id: task.id, title: 'Renamed', status: 'completed' } }]));

    await confirmTurn(runtime);

    expect(repository.getTask(task.id)?.title).toBe('Renamed');
    expect(changes).toEqual([]);
  });

  it('reports a block created through an approved AI action as a copy', async () => {
    const repository = new LocalRepository(createSeedData());
    const created: ScheduleBlock[] = [];
    const runtime = createLocalAssistantRuntime(repository, { onBlockCreated: (block) => created.push(block) }, providerFor([{ name: 'block.create', arguments: { title: 'revisar pauta', start: '2026-09-07T22:00:00-03:00', end: '2026-09-07T23:00:00-03:00', category: 'work' } }]));

    await confirmTurn(runtime);

    const stored = repository.listBlocks().find((block) => block.title === 'revisar pauta');
    expect(stored).toBeDefined();
    expect(created).toEqual([stored]);
    created[0]!.title = 'mutated by the hook';
    expect(repository.listBlocks().some((block) => block.id === stored!.id && block.title === 'revisar pauta')).toBe(true);
  });

  it('reports a block deleted through an approved AI action', async () => {
    const repository = new LocalRepository(createSeedData()); const block = repository.listBlocks()[0]!;
    const deleted: ScheduleBlock[] = [];
    const runtime = createLocalAssistantRuntime(repository, { onBlockDeleted: (item) => deleted.push(item) }, providerFor([{ name: 'block.delete', arguments: { id: block.id } }]));

    await confirmTurn(runtime);

    expect(repository.listBlocks().some((item) => item.id === block.id)).toBe(false);
    expect(deleted).toEqual([block]);
  });

  it('does not report block creation or deletion when an approved AI action updates a block', async () => {
    const repository = new LocalRepository(createSeedData()); const block = repository.listBlocks()[0]!;
    const reported: string[] = [];
    const runtime = createLocalAssistantRuntime(repository, { onBlockCreated: () => reported.push('created'), onBlockDeleted: () => reported.push('deleted') }, providerFor([{ name: 'block.update', arguments: { id: block.id, title: 'Bloco revisado' } }]));

    await confirmTurn(runtime);

    expect(repository.listBlocks().find((item) => item.id === block.id)?.title).toBe('Bloco revisado');
    expect(reported).toEqual([]);
  });

  it('deletes a reminder only after an explicit confirmation', async () => {
    const repository = new LocalRepository(createSeedData()); const reminder = repository.listReminders()[0]!;
    const runtime = createLocalAssistantRuntime(repository, {}, providerFor([{ name: 'reminder.delete', arguments: { id: reminder.id } }]));

    const pending = await runtime.runTurn({ message: 'Delete it', surface: 'desktop' });
    expect(repository.listReminders().some((item) => item.id === reminder.id)).toBe(true);
    if (!pending.confirmation) throw new Error('Expected confirmation');
    await runtime.confirm(pending.confirmation);
    expect(repository.listReminders().some((item) => item.id === reminder.id)).toBe(false);
  });

  it('interprets local edit and delete commands for every mutable workspace entity', async () => {
    const repository = new LocalRepository(createSeedData());
    const note = repository.createNote({ title: 'Rascunho', content: 'texto', folder: 'Bento', createdAt: '2026-09-07T09:00:00-03:00', updatedAt: '2026-09-07T09:00:00-03:00' });
    // O id do bloco do seed carrega o dia, e o seed é ancorado no dia em que roda: vem do próprio
    // repositório, senão este caso voltaria a depender de uma data fixa.
    const blockId = repository.listBlocks()[0]!.id;
    const cases: Array<[string, string, () => boolean]> = [
      ['edite tarefa: Kabrito Post 01 para Post revisado', 'exclua tarefa: Post revisado', () => repository.listTasks().some((item) => item.title === 'Post revisado')],
      ['edite lembrete: vaga/inglês - Horizontes para Aviso Horizontes', 'exclua lembrete: Aviso Horizontes', () => repository.listReminders().some((item) => item.title === 'Aviso Horizontes')],
      [`edite bloco: ${blockId} para Bloco revisado`, 'exclua bloco: Bloco revisado', () => repository.listBlocks().some((item) => item.title === 'Bloco revisado')],
      ['edite nota: Rascunho para Nota revisada', 'exclua nota: Nota revisada', () => repository.listNotes().some((item) => item.id === note.id && item.title === 'Nota revisada')],
    ];
    const runtime = createLocalAssistantRuntime(repository);

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

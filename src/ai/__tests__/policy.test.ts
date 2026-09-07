import { describe, expect, it } from 'vitest';
import { AiToolPolicy } from '../policy';
import { ToolRegistry, type HibiTool, type ToolRisk } from '../tools';

const tool = (name: string, risk: ToolRisk, options: Partial<Pick<HibiTool, 'bulk' | 'externallyVisible'>> = {}): HibiTool => ({
  name, description: name, risk, inputSchema: { type: 'object' }, ...options,
  validate: (arguments_) => typeof arguments_.id === 'string',
  execute: () => ({ summary: 'done' }),
});
const registry = () => new ToolRegistry()
  .register(tool('search.tasks', 'read'))
  .register(tool('task.complete', 'reversible'))
  .register(tool('task.delete', 'destructive'))
  .register(tool('message.send', 'external'))
  .register(tool('task.bulkComplete', 'reversible', { bulk: true }));

describe('AI tool policy', () => {
  it('automatically permits search and explicit reversible single mutations', async () => {
    const policy = new AiToolPolicy(registry());
    await expect(policy.decide([{ name: 'search.tasks', arguments: { id: 'today' } }], 0)).resolves.toEqual({ kind: 'execute' });
    await expect(policy.decide([{ name: 'task.complete', arguments: { id: 'task-1' } }], 0)).resolves.toEqual({ kind: 'execute' });
  });

  it('requires confirmation for destructive, bulk, and external actions', async () => {
    const policy = new AiToolPolicy(registry());
    for (const name of ['task.delete', 'task.bulkComplete', 'message.send']) {
      const outcome = await policy.decide([{ name, arguments: { id: 'item-1' } }], 0);
      expect(outcome.kind).toBe('confirm');
    }
  });

  it('requires confirmation for multiple mutations, even when each is reversible', async () => {
    const policy = new AiToolPolicy(registry());
    await expect(policy.decide([
      { name: 'task.complete', arguments: { id: 'task-1' } },
      { name: 'task.complete', arguments: { id: 'task-2' } },
    ], 0)).resolves.toMatchObject({ kind: 'confirm' });
  });

  it('blocks unknown tools and invalid arguments', async () => {
    const policy = new AiToolPolicy(registry());
    await expect(policy.decide([{ name: 'shell.exec', arguments: { id: 'x' } }])).resolves.toMatchObject({ kind: 'blocked', reason: 'Unknown tool: shell.exec' });
    await expect(policy.decide([{ name: 'search.tasks', arguments: {} }])).resolves.toMatchObject({ kind: 'blocked', reason: 'Invalid arguments for tool: search.tasks' });
  });

  it('binds confirmation to normalized calls and prevents reuse', async () => {
    const policy = new AiToolPolicy(registry());
    const calls = [{ name: 'task.delete', arguments: { id: 'task-1', nested: { b: 2, a: 1 } } }];
    const decision = await policy.decide(calls, 100);
    if (decision.kind !== 'confirm') throw new Error('Expected confirmation');
    await expect(policy.consume(decision.confirmation.id, [{ name: 'task.delete', arguments: { nested: { a: 1, b: 2 }, id: 'task-1' } }], 101)).resolves.toEqual({ kind: 'execute' });
    await expect(policy.consume(decision.confirmation.id, calls, 102)).resolves.toMatchObject({ kind: 'blocked' });
  });

  it('rejects modified arguments and expired confirmations', async () => {
    const policy = new AiToolPolicy(registry(), 10);
    const decision = await policy.decide([{ name: 'task.delete', arguments: { id: 'task-1' } }], 100);
    if (decision.kind !== 'confirm') throw new Error('Expected confirmation');
    await expect(policy.consume(decision.confirmation.id, [{ name: 'task.delete', arguments: { id: 'task-2' } }], 101)).resolves.toMatchObject({ kind: 'blocked', reason: 'Confirmation does not match these tool calls.' });
    await expect(policy.consume(decision.confirmation.id, [{ name: 'task.delete', arguments: { id: 'task-1' } }], 111)).resolves.toMatchObject({ kind: 'blocked', reason: 'Confirmation has expired.' });
  });

  it('invalidates a cancelled confirmation so it can never execute', async () => {
    const policy = new AiToolPolicy(registry());
    const calls = [{ name: 'task.delete', arguments: { id: 'task-1' } }];
    const decision = await policy.decide(calls, 100);
    if (decision.kind !== 'confirm') throw new Error('Expected confirmation');

    expect(policy.cancel(decision.confirmation.id)).toBe(true);
    expect(policy.cancel(decision.confirmation.id)).toBe(false);
    await expect(policy.consume(decision.confirmation.id, calls, 101)).resolves.toMatchObject({ kind: 'blocked' });
  });
});

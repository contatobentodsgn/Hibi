import { describe, expect, it, vi } from 'vitest';
import type { AiProvider } from '../contracts';
import { AiTurnRuntime } from '../runtime';
import { AiToolPolicy } from '../policy';
import { ToolRegistry, type HibiTool } from '../tools';

const testTool = (name: string, risk: HibiTool['risk'] = 'read', execute = () => ({ summary: name })): HibiTool => ({ name, description: name, risk, inputSchema: {}, validate: () => true, execute });
const provider = (proposal: Parameters<AiProvider['generate']>[0] extends never ? never : any, label = 'Fake provider'): AiProvider => ({ id: 'fake', label, generate: vi.fn().mockResolvedValue(proposal) });
const setup = (ai: AiProvider, tools: readonly HibiTool[] = []) => { const registry = new ToolRegistry(); tools.forEach((tool) => registry.register(tool)); return new AiTurnRuntime({ registry, policy: new AiToolPolicy(registry), context: { tasks: [{ id: 't1', title: 'Write brief' }], schedule: [{ id: 's1', title: 'Deep work', start: '09:00', end: '10:00' }] }, provider: ai }); };

describe('AI turn runtime', () => {
  it('selects minimal relevant context, emits stages, and preserves provider label', async () => {
    const ai = provider({ reply: 'Agenda', toolCalls: [], notchPresentation: null }); const stages: string[] = [];
    const runtime = new AiTurnRuntime({ registry: new ToolRegistry(), policy: new AiToolPolicy(new ToolRegistry()), context: { schedule: [{ id: 's1', title: 'Deep work', start: '09:00', end: '10:00' }], tasks: [{ id: 't1', title: 'Do not leak' }] }, provider: ai, onStage: ({ stage }) => stages.push(stage) });
    const result = await runtime.runTurn({ message: 'What is on my schedule?', surface: 'desktop', now: new Date('2026-08-03T09:00:00Z') });
    expect(result.providerLabel).toBe('Fake provider'); expect(stages).toEqual(['received', 'interpreting', 'gathering_context', 'generating', 'validating', 'executing', 'completed']);
    expect((ai.generate as ReturnType<typeof vi.fn>).mock.calls[0][0].contextEvidence).toHaveLength(1);
  });
  it('returns confirmation without executing a destructive proposal', async () => {
    const remove = testTool('task.delete', 'destructive', vi.fn()); const runtime = setup(provider({ reply: 'Delete?', toolCalls: [{ name: 'task.delete', arguments: {} }], notchPresentation: null }), [remove]);
    const result = await runtime.runTurn({ message: 'Delete it', surface: 'desktop' }); expect(result.confirmation).toBeDefined(); expect(remove.execute).not.toHaveBeenCalled();
  });
  it('executes the exact calls only after consuming its confirmation', async () => {
    const execute = vi.fn(() => ({ summary: 'Deleted' })); const remove = testTool('task.delete', 'destructive', execute);
    const runtime = setup(provider({ reply: 'Delete?', toolCalls: [{ name: 'task.delete', arguments: { id: 'task-1' } }], notchPresentation: null }), [remove]);
    const pending = await runtime.runTurn({ message: 'Delete it', surface: 'desktop' });
    if (!pending.confirmation) throw new Error('Expected confirmation');
    await expect(runtime.confirm(pending.confirmation)).resolves.toMatchObject({ toolResults: [{ summary: 'Deleted' }] });
    expect(execute).toHaveBeenCalledWith({ id: 'task-1' }, expect.any(Object));
  });
  it('never executes a confirmation after the user cancels it', async () => {
    const execute = vi.fn(() => ({ summary: 'Deleted' })); const remove = testTool('task.delete', 'destructive', execute);
    const runtime = setup(provider({ reply: 'Delete?', toolCalls: [{ name: 'task.delete', arguments: { id: 'task-1' } }], notchPresentation: null }), [remove]);
    const pending = await runtime.runTurn({ message: 'Delete it', surface: 'desktop' });
    if (!pending.confirmation) throw new Error('Expected confirmation');

    expect(runtime.cancelConfirmation(pending.confirmation)).toBe(true);
    await expect(runtime.confirm(pending.confirmation)).rejects.toThrow(/invalid|used/i);
    expect(execute).not.toHaveBeenCalled();
  });
  it('executes calls sequentially and reports truthful partial failures', async () => {
    const sequence: string[] = []; const first = testTool('first', 'read', () => { sequence.push('first'); return { summary: 'first' }; }); const second = testTool('second', 'read', () => { sequence.push('second'); throw new Error('Second failed'); });
    const runtime = setup(provider({ reply: 'Done', toolCalls: [{ name: 'first', arguments: {} }, { name: 'second', arguments: {} }], notchPresentation: null }), [first, second]);
    const result = await runtime.runTurn({ message: 'Run', surface: 'desktop' }); expect(sequence).toEqual(['first', 'second']); expect(result.toolResults).toHaveLength(1); expect(result.partialFailure).toBe('Second failed'); expect(result.reply).toContain('Second failed');
  });
  it('cancels a pending provider before tools execute', async () => {
    let release!: () => void; const delayed: AiProvider = { id: 'delay', label: 'Delayed', generate: () => new Promise((resolve) => { release = () => resolve({ reply: 'late', toolCalls: [], notchPresentation: null }); }) }; const runtime = setup(delayed);
    const pending = runtime.runTurn({ message: 'Wait', surface: 'desktop' }); runtime.cancel(); release(); await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { AiProvider } from '../contracts';
import { AiTurnRuntime } from '../runtime';
import { AiToolPolicy } from '../policy';
import { ToolRegistry, type PixanoTool } from '../tools';

const testTool = (name: string, risk: PixanoTool['risk'] = 'read', execute = () => ({ summary: name })): PixanoTool => ({ name, description: name, risk, inputSchema: {}, validate: () => true, execute });
const provider = (proposal: Parameters<AiProvider['generate']>[0] extends never ? never : any, label = 'Fake provider'): AiProvider => ({ id: 'fake', label, generate: vi.fn().mockResolvedValue(proposal) });
const setup = (ai: AiProvider, tools: readonly PixanoTool[] = []) => { const registry = new ToolRegistry(); tools.forEach((tool) => registry.register(tool)); return new AiTurnRuntime({ registry, policy: new AiToolPolicy(registry), context: { tasks: [{ id: 't1', title: 'Write brief' }], schedule: [{ id: 's1', title: 'Deep work', start: '09:00', end: '10:00' }] }, provider: ai }); };

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
  it('emits an auditable lifecycle with provider, model, requested tool, confirmation, and execution result', async () => {
    const events: any[] = []; const remove = testTool('task.delete', 'destructive', () => ({ summary: 'Deleted task' }));
    const runtime = new AiTurnRuntime({ registry: new ToolRegistry().register(remove), policy: new AiToolPolicy(new ToolRegistry().register(remove)), context: {}, provider: provider({ reply: 'Delete?', toolCalls: [{ name: 'task.delete', arguments: {} }], notchPresentation: null, providerMetadata: { model: 'audit-model' } }, 'Audit provider'), onAudit: (event) => events.push(event) });
    const pending = await runtime.runTurn({ message: 'Delete', surface: 'desktop' }); if (!pending.confirmation) throw new Error('Expected confirmation');
    await runtime.confirm(pending.confirmation);
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining(['turn.received', 'tool.requested', 'confirmation.requested', 'confirmation.confirmed', 'tool.completed']))
    expect(events.find((event) => event.type === 'tool.requested')).toMatchObject({ provider: 'Audit provider', model: 'audit-model', tools: ['task.delete'] })
    expect(JSON.stringify(events)).not.toContain('arguments')
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
  it('returns actual provider, model, usage, and fallback provenance', async () => {
    const runtime = setup(provider({ reply: 'Agenda', toolCalls: [], notchPresentation: null, providerMetadata: { requestId: 'provider-7', model: 'reported-model', usage: { inputTokens: 12, outputTokens: 5, totalTokens: 17 } } }, 'Remote provider'));

    const result = await runtime.runTurn({ message: 'What is on my schedule?', surface: 'desktop' });

    expect(result.provider).toEqual({ id: 'fake', label: 'Remote provider', requestId: 'provider-7', model: 'reported-model', usage: { inputTokens: 12, outputTokens: 5, totalTokens: 17 }, fallback: false });
    expect(result.providerLabel).toBe('Remote provider');
  });
  it('forwards provider progress through a request-scoped live event channel', async () => {
    const events: unknown[] = [];
    const streaming: AiProvider = {
      id: 'remote', label: 'Remote provider',
      generate: async (request) => {
        request.onStreamEvent?.({ type: 'started', requestId: 'provider-4', provider: 'Remote provider', model: 'gpt-test' });
        request.onStreamEvent?.({ type: 'delta', delta: 'Hello' });
        request.onStreamEvent?.({ type: 'usage', usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 } });
        request.onStreamEvent?.({ type: 'completed' });
        return { reply: 'Hello', toolCalls: [], notchPresentation: null, providerMetadata: { model: 'gpt-test' } };
      },
    };
    const registry = new ToolRegistry();
    const runtime = new AiTurnRuntime({ registry, policy: new AiToolPolicy(registry), context: {}, provider: streaming, onStreamEvent: (event) => events.push(event) });

    await runtime.runTurn({ message: 'Hello', surface: 'desktop' });

    expect(events).toEqual([
      { requestId: 'ai-1', event: { type: 'started', requestId: 'provider-4', provider: 'Remote provider', model: 'gpt-test' } },
      { requestId: 'ai-1', event: { type: 'delta', delta: 'Hello' } },
      { requestId: 'ai-1', event: { type: 'usage', usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 } } },
      { requestId: 'ai-1', event: { type: 'completed' } },
    ]);
  });
  it('uses the local fallback only automatically for a safe temporary provider failure', async () => {
    const unavailable = Object.assign(new Error('safe unavailable'), { failure: { code: 'unavailable', retryable: true } });
    const remote: AiProvider = { id: 'remote', label: 'Remote provider', generate: vi.fn().mockRejectedValue(unavailable) };
    const local = provider({ reply: 'Local agenda', toolCalls: [], notchPresentation: null, providerMetadata: { model: 'local-model' } }, 'Local provider');
    const registry = new ToolRegistry();
    const runtime = new AiTurnRuntime({ registry, policy: new AiToolPolicy(registry), context: {}, provider: remote, fallbackProvider: local, fallbackPolicy: 'automatic' });

    const result = await runtime.runTurn({ message: 'Plan today', surface: 'desktop' });

    expect(local.generate).toHaveBeenCalledOnce();
    expect(result.provider).toMatchObject({ id: 'fake', label: 'Local provider', model: 'local-model', fallback: true });
  });
  it('uses the local provider directly only after an explicit fallback request', async () => {
    const remote = provider({ reply: 'Remote response', toolCalls: [], notchPresentation: null }, 'Remote provider');
    const local = provider({ reply: 'Local response', toolCalls: [], notchPresentation: null, providerMetadata: { model: 'local-model' } }, 'Local provider');
    const registry = new ToolRegistry();
    const runtime = new AiTurnRuntime({ registry, policy: new AiToolPolicy(registry), context: {}, provider: remote, fallbackProvider: local, fallbackPolicy: 'never' });

    const result = await runtime.runTurn({ message: 'Plan today', surface: 'desktop', useLocalFallback: true });

    expect(remote.generate).not.toHaveBeenCalled();
    expect(local.generate).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ reply: 'Local response', provider: { label: 'Local provider', model: 'local-model', fallback: true } });
  });
  it('does not invoke fallback for non-retryable failures, cancellation, or a non-automatic policy', async () => {
    const cases = [
      { policy: 'ask', error: Object.assign(new Error('credentials'), { failure: { code: 'invalid_credentials', retryable: false } }) },
      { policy: 'never', error: Object.assign(new Error('unavailable'), { failure: { code: 'unavailable', retryable: true } }) },
      { policy: 'automatic', error: Object.assign(new Error('invalid response'), { failure: { code: 'invalid_response', retryable: false } }) },
      { policy: 'automatic', error: Object.assign(new Error('not retryable'), { failure: { code: 'unavailable', retryable: false } }) },
      { policy: 'automatic', error: Object.assign(new Error('cancelled'), { name: 'AbortError', failure: { code: 'cancelled', retryable: false } }) },
    ] as const;
    for (const { policy, error } of cases) {
      const remote: AiProvider = { id: 'remote', label: 'Remote provider', generate: vi.fn().mockRejectedValue(error) };
      const local = provider({ reply: 'Must not run', toolCalls: [], notchPresentation: null }, 'Local provider');
      const registry = new ToolRegistry();
      const runtime = new AiTurnRuntime({ registry, policy: new AiToolPolicy(registry), context: {}, provider: remote, fallbackProvider: local, fallbackPolicy: policy });

      await expect(runtime.runTurn({ message: 'Plan today', surface: 'desktop' })).rejects.toThrow(error.message);
      expect(local.generate).not.toHaveBeenCalled();
    }
  });
});

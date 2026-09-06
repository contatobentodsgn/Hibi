import type { AiContextEvidence, AiConversationEntry, AiProvider, AiProviderProposal, AiSurface, AiToolCall, AiTurnStage } from './contracts';
import { selectMinimalContext, type AiContextSource } from './context';
import { HeuristicAiProvider } from './heuristic-provider';
import { AiToolPolicy, type Confirmation } from './policy';
import { ToolRegistry, type ToolExecutionResult } from './tools';

export interface AiTurnInput { readonly message: string; readonly surface: AiSurface; readonly locale?: string; readonly now?: Date; readonly transcript?: readonly AiConversationEntry[]; }
export interface AiRuntimeEvent { readonly requestId: string; readonly stage: AiTurnStage; }
export interface AiRuntimeResult { readonly requestId: string; readonly providerLabel: string; readonly reply: string; readonly proposal: AiProviderProposal; readonly confirmation?: Confirmation; readonly toolResults: readonly ToolExecutionResult[]; readonly partialFailure?: string; }
export interface AiRuntimeDependencies { readonly registry: ToolRegistry; readonly policy: AiToolPolicy; readonly context: AiContextSource; readonly provider?: AiProvider; readonly fallbackProvider?: AiProvider; readonly onStage?: (event: AiRuntimeEvent) => void; }

export class AiTurnRuntime {
  private active: AbortController | null = null;
  private sequence = 0;
  constructor(private readonly deps: AiRuntimeDependencies) {}

  cancel(): void { this.active?.abort(); }

  async runTurn(input: AiTurnInput): Promise<AiRuntimeResult> {
    this.cancel();
    const controller = new AbortController();
    this.active = controller;
    const requestId = `ai-${++this.sequence}`;
    const emit = (stage: AiTurnStage) => this.deps.onStage?.({ requestId, stage });
    const message = input.message.trim().slice(0, 8_000);
    if (!message) throw new Error('A message is required.');
    try {
      emit('received'); emit('interpreting'); emit('gathering_context');
      const contextEvidence: readonly AiContextEvidence[] = selectMinimalContext(message, this.deps.context);
      emit('generating');
      const request = { message, locale: input.locale ?? 'en-US', currentTime: (input.now ?? new Date()).toISOString(), surface: input.surface, allowedTools: this.deps.registry.schemas(), contextEvidence, recentTranscript: (input.transcript ?? []).slice(-12) };
      const provider = this.deps.provider ?? new HeuristicAiProvider();
      let proposal: AiProviderProposal;
      let providerLabel = provider.label;
      try { proposal = await provider.generate(request, controller.signal); }
      catch (error) {
        if (controller.signal.aborted) throw error;
        const fallback = this.deps.fallbackProvider;
        if (!fallback) throw error;
        proposal = await fallback.generate(request, controller.signal);
        providerLabel = fallback.label;
      }
      if (controller.signal.aborted) throw new DOMException('The AI turn was cancelled.', 'AbortError');
      emit('validating');
      const calls = proposal.toolCalls.slice(0, 2);
      const decision = await this.deps.policy.decide(calls);
      if (decision.kind === 'blocked') throw new Error(decision.reason);
      if (decision.kind === 'confirm') {
        emit('awaiting_confirmation');
        return { requestId, providerLabel, reply: proposal.reply, proposal, confirmation: decision.confirmation, toolResults: [] };
      }
      emit('executing');
      const toolResults: ToolExecutionResult[] = [];
      let partialFailure: string | undefined;
      for (const call of calls) {
        if (controller.signal.aborted) throw new DOMException('The AI turn was cancelled.', 'AbortError');
        try { toolResults.push(await this.execute(call)); }
        catch (error) { partialFailure = error instanceof Error ? error.message : 'A tool failed.'; break; }
      }
      emit('completed');
      return { requestId, providerLabel, reply: partialFailure ? `${proposal.reply}\n\n${partialFailure}` : proposal.reply, proposal, toolResults, partialFailure };
    } catch (error) {
      emit('failed');
      throw error;
    } finally { if (this.active === controller) this.active = null; }
  }

  private async execute(call: AiToolCall): Promise<ToolExecutionResult> {
    const tool = this.deps.registry.get(call.name);
    if (!tool) throw new Error(`Unknown tool: ${call.name}`);
    return tool.execute(call.arguments, { nowMs: Date.now() });
  }
}

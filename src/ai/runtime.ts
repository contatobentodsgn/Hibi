import type { AiContextEvidence, AiConversationEntry, AiProvider, AiProviderProposal, AiSurface, AiToolCall, AiTurnStage } from './contracts';
import { selectMinimalContext, type AiContextSource } from './context';
import { HeuristicAiProvider } from './heuristic-provider';
import { AiToolPolicy, type Confirmation } from './policy';
import { ToolRegistry, type ToolExecutionResult } from './tools';
import type { AiAuditEvent } from './history';

export interface AiTurnInput { readonly message: string; readonly surface: AiSurface; readonly locale?: string; readonly now?: Date; readonly transcript?: readonly AiConversationEntry[]; }
export interface AiRuntimeEvent { readonly requestId: string; readonly stage: AiTurnStage; }
export interface AiRuntimeResult { readonly requestId: string; readonly providerLabel: string; readonly reply: string; readonly proposal: AiProviderProposal; readonly confirmation?: Confirmation; readonly toolResults: readonly ToolExecutionResult[]; readonly partialFailure?: string; }
export interface AiRuntimeDependencies { readonly registry: ToolRegistry; readonly policy: AiToolPolicy; readonly context: AiContextSource; readonly provider?: AiProvider; readonly fallbackProvider?: AiProvider; readonly onStage?: (event: AiRuntimeEvent) => void; readonly onAudit?: (event: AiAuditEvent) => void; }

export class AiTurnRuntime {
  private active: AbortController | null = null;
  private sequence = 0;
  private readonly confirmationAudit = new Map<string, Pick<AiAuditEvent, 'requestId' | 'provider' | 'model' | 'tools'>>();
  constructor(private readonly deps: AiRuntimeDependencies) {}

  cancel(): void { this.active?.abort(); }

  async confirm(confirmation: Confirmation): Promise<Pick<AiRuntimeResult, 'toolResults' | 'partialFailure'>> {
    const decision = await this.deps.policy.consume(confirmation.id, confirmation.calls);
    if (decision.kind === 'blocked') throw new Error(decision.reason);
    if (decision.kind !== 'execute') throw new Error('Confirmation could not be consumed.');
    const audit = this.confirmationAudit.get(confirmation.id); this.confirmationAudit.delete(confirmation.id);
    if (audit) this.audit({ type: 'confirmation.confirmed', ...audit, at: new Date().toISOString(), summary: 'Confirmation approved.' });
    return this.executeCalls(confirmation.calls, undefined, audit);
  }

  cancelConfirmation(confirmation: Confirmation): boolean { const cancelled = this.deps.policy.cancel(confirmation.id); const audit = this.confirmationAudit.get(confirmation.id); this.confirmationAudit.delete(confirmation.id); if (cancelled && audit) this.audit({ type: 'confirmation.cancelled', ...audit, at: new Date().toISOString(), summary: 'Confirmation cancelled.' }); return cancelled; }

  async runTurn(input: AiTurnInput): Promise<AiRuntimeResult> {
    this.cancel();
    const controller = new AbortController();
    this.active = controller;
    const requestId = `ai-${++this.sequence}`;
    const emit = (stage: AiTurnStage) => this.deps.onStage?.({ requestId, stage });
    const message = input.message.trim().slice(0, 8_000);
    if (!message) throw new Error('A message is required.');
    try {
      this.audit({ type: 'turn.received', requestId, at: new Date().toISOString(), summary: 'Assistant turn received.' });
      emit('received'); emit('interpreting'); emit('gathering_context');
      const contextEvidence: readonly AiContextEvidence[] = selectMinimalContext(message, this.deps.context);
      emit('generating');
      const request = { message, locale: input.locale ?? 'en-US', currentTime: (input.now ?? new Date()).toISOString(), surface: input.surface, allowedTools: this.deps.registry.schemas(), contextEvidence, recentTranscript: (input.transcript ?? []).slice(-12) };
      const provider = this.deps.provider ?? new HeuristicAiProvider();
      let proposal: AiProviderProposal;
      let providerLabel = provider.label;
      let auditProvider = provider.label;
      try { proposal = await provider.generate(request, controller.signal); }
      catch (error) {
        if (controller.signal.aborted) throw error;
        const fallback = this.deps.fallbackProvider;
        if (!fallback) throw error;
        proposal = await fallback.generate(request, controller.signal);
        providerLabel = fallback.label;
        auditProvider = fallback.label;
      }
      providerLabel = proposal.providerMetadata?.model ?? providerLabel;
      if (controller.signal.aborted) throw new DOMException('The AI turn was cancelled.', 'AbortError');
      emit('validating');
      const calls = proposal.toolCalls.slice(0, 2);
      const auditMeta = { requestId, provider: auditProvider, model: proposal.providerMetadata?.model, ...(calls.length ? { tools: calls.map((call) => call.name) } : {}) };
      if (calls.length) this.audit({ type: 'tool.requested', ...auditMeta, at: new Date().toISOString(), summary: 'Tool action requested.' });
      const decision = await this.deps.policy.decide(calls);
      if (decision.kind === 'blocked') throw new Error(decision.reason);
      if (decision.kind === 'confirm') {
        emit('awaiting_confirmation');
        this.confirmationAudit.set(decision.confirmation.id, auditMeta);
        this.audit({ type: 'confirmation.requested', ...auditMeta, at: new Date().toISOString(), summary: 'Confirmation required.' });
        return { requestId, providerLabel, reply: proposal.reply, proposal, confirmation: decision.confirmation, toolResults: [] };
      }
      emit('executing');
      const { toolResults, partialFailure } = await this.executeCalls(calls, controller.signal, auditMeta);
      emit('completed');
      return { requestId, providerLabel, reply: partialFailure ? `${proposal.reply}\n\n${partialFailure}` : proposal.reply, proposal, toolResults, partialFailure };
    } catch (error) {
      emit('failed');
      this.audit({ type: 'failed', requestId, at: new Date().toISOString(), summary: error instanceof Error ? error.message : 'AI turn failed.' });
      throw error;
    } finally { if (this.active === controller) this.active = null; }
  }

  private async execute(call: AiToolCall): Promise<ToolExecutionResult> {
    const tool = this.deps.registry.get(call.name);
    if (!tool) throw new Error(`Unknown tool: ${call.name}`);
    return tool.execute(call.arguments, { nowMs: Date.now() });
  }

  private audit(event: AiAuditEvent): void { this.deps.onAudit?.(event); }

  private async executeCalls(calls: readonly AiToolCall[], signal?: AbortSignal, audit?: Pick<AiAuditEvent, 'requestId' | 'provider' | 'model' | 'tools'>): Promise<Pick<AiRuntimeResult, 'toolResults' | 'partialFailure'>> {
    const toolResults: ToolExecutionResult[] = [];
    let partialFailure: string | undefined;
    for (const call of calls) {
      if (signal?.aborted) throw new DOMException('The AI turn was cancelled.', 'AbortError');
      try { const result = await this.execute(call); toolResults.push(result); if (audit) this.audit({ type: 'tool.completed', ...audit, at: new Date().toISOString(), summary: result.summary }); }
      catch (error) { partialFailure = error instanceof Error ? error.message : 'A tool failed.'; if (audit) this.audit({ type: 'failed', ...audit, at: new Date().toISOString(), summary: partialFailure }); break; }
    }
    return { toolResults, partialFailure };
  }
}

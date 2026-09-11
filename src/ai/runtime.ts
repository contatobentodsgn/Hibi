import type { AiContextEvidence, AiConversationEntry, AiFallbackPolicy, AiNormalizedUsage, AiProvider, AiProviderFailure, AiProviderProposal, AiProviderStreamEvent, AiSurface, AiToolCall, AiTurnStage } from './contracts';
import { selectMinimalContext, type AiContextSource } from './context';
import { HeuristicAiProvider } from './heuristic-provider';
import { AiToolPolicy, type Confirmation } from './policy';
import { ToolRegistry, type ToolExecutionResult } from './tools';
import type { AiAuditEvent } from './history';
import { classifyProviderFailure } from './production';

export interface AiTurnInput { readonly message: string; readonly surface: AiSurface; readonly locale?: string; readonly now?: Date; readonly transcript?: readonly AiConversationEntry[]; readonly requestId?: string; readonly useLocalFallback?: boolean; }
export interface AiRuntimeEvent { readonly requestId: string; readonly stage: AiTurnStage; }
export interface AiRuntimeProviderMetadata { readonly id: string; readonly label: string; readonly requestId?: string; readonly model?: string; readonly usage?: AiNormalizedUsage; readonly fallback: boolean; }
export interface AiRuntimeResult { readonly requestId: string; readonly providerLabel: string; readonly provider: AiRuntimeProviderMetadata; readonly reply: string; readonly proposal: AiProviderProposal; readonly confirmation?: Confirmation; readonly toolResults: readonly ToolExecutionResult[]; readonly partialFailure?: string; }
export interface AiRuntimeUsageEvent { readonly at: string; readonly provider: string; readonly model: string; readonly usage: AiNormalizedUsage; readonly outcome: 'completed'; readonly fallback: boolean; }
export interface AiRuntimeStreamEvent { readonly requestId: string; readonly event: AiProviderStreamEvent; }
export interface AiRuntimeDependencies { readonly registry: ToolRegistry; readonly policy: AiToolPolicy; readonly context: AiContextSource; readonly provider?: AiProvider; readonly fallbackProvider?: AiProvider; readonly fallbackPolicy?: AiFallbackPolicy | (() => AiFallbackPolicy); readonly onStage?: (event: AiRuntimeEvent) => void; readonly onStreamEvent?: (event: AiRuntimeStreamEvent) => void; readonly onAudit?: (event: AiAuditEvent) => void; readonly onUsage?: (event: AiRuntimeUsageEvent) => void; }

function safeFailureFrom(error: unknown): AiProviderFailure {
  if (typeof error === 'object' && error !== null && 'failure' in error) {
    const failure = (error as { failure?: unknown }).failure
    if (typeof failure === 'object' && failure !== null && 'code' in failure && 'retryable' in failure) {
      const { code, retryable, retryAfterMs } = failure as Partial<AiProviderFailure>
      if (['invalid_credentials', 'invalid_request', 'rate_limited', 'unavailable', 'invalid_response', 'cancelled'].includes(String(code)) && typeof retryable === 'boolean' && (retryAfterMs === undefined || typeof retryAfterMs === 'number')) return { code: code as AiProviderFailure['code'], retryable, ...(typeof retryAfterMs === 'number' ? { retryAfterMs } : {}) }
    }
  }
  return classifyProviderFailure(error)
}

function fallbackPolicyFor(policy: AiRuntimeDependencies['fallbackPolicy']): AiFallbackPolicy | undefined {
  const value = typeof policy === 'function' ? policy() : policy
  return value === 'ask' || value === 'automatic' || value === 'never' ? value : undefined
}

function shouldFallback(policy: AiRuntimeDependencies['fallbackPolicy'], failure: AiProviderFailure): boolean {
  const selected = fallbackPolicyFor(policy)
  return selected === 'automatic'
    && failure.retryable
    && (failure.code === 'rate_limited' || failure.code === 'unavailable')
}

export class AiTurnRuntime {
  private active: AbortController | null = null;
  private sequence = 0;
  private readonly streamListeners = new Set<(event: AiRuntimeStreamEvent) => void>();
  private readonly confirmationAudit = new Map<string, Pick<AiAuditEvent, 'requestId' | 'provider' | 'model' | 'tools'>>();
  constructor(private readonly deps: AiRuntimeDependencies) {}

  cancel(): void { this.active?.abort(); }

  subscribeToStream(listener: (event: AiRuntimeStreamEvent) => void): () => void {
    this.streamListeners.add(listener);
    return () => this.streamListeners.delete(listener);
  }

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
    const requestId = typeof input.requestId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(input.requestId)
      ? input.requestId
      : `ai-${++this.sequence}`;
    const emit = (stage: AiTurnStage) => this.deps.onStage?.({ requestId, stage });
    const message = input.message.trim().slice(0, 8_000);
    if (!message) throw new Error('A message is required.');
    try {
      this.audit({ type: 'turn.received', requestId, at: new Date().toISOString(), summary: 'Assistant turn received.' });
      emit('received'); emit('interpreting'); emit('gathering_context');
      const contextEvidence: readonly AiContextEvidence[] = selectMinimalContext(message, this.deps.context);
      emit('generating');
      const publishStream = (event: AiProviderStreamEvent) => {
        const value = { requestId, event } satisfies AiRuntimeStreamEvent;
        this.deps.onStreamEvent?.(value);
        this.streamListeners.forEach((listener) => listener(value));
      };
      const request = { message, locale: input.locale ?? 'en-US', currentTime: (input.now ?? new Date()).toISOString(), surface: input.surface, allowedTools: this.deps.registry.schemas(), contextEvidence, recentTranscript: (input.transcript ?? []).slice(-12), onStreamEvent: publishStream };
      const provider = this.deps.provider ?? new HeuristicAiProvider();
      let proposal: AiProviderProposal;
      const fallback = this.deps.fallbackProvider;
      let actualProvider = input.useLocalFallback && fallback ? fallback : provider;
      let usedFallback = input.useLocalFallback === true && fallback !== undefined;
      try { proposal = await actualProvider.generate(request, controller.signal); }
      catch (error) {
        const failure = safeFailureFrom(error);
        if (controller.signal.aborted || failure.code === 'cancelled' || usedFallback) throw error;
        if (!fallback || !shouldFallback(this.deps.fallbackPolicy, failure)) throw error;
        proposal = await fallback.generate(request, controller.signal);
        actualProvider = fallback;
        usedFallback = true;
      }
      if (controller.signal.aborted) throw new DOMException('The AI turn was cancelled.', 'AbortError');
      const providerMetadata: AiRuntimeProviderMetadata = {
        id: proposal.providerMetadata?.providerId ?? actualProvider.id,
        label: proposal.providerMetadata?.provider ?? actualProvider.label,
        ...(proposal.providerMetadata?.requestId === undefined ? {} : { requestId: proposal.providerMetadata.requestId }),
        ...(proposal.providerMetadata?.model === undefined ? {} : { model: proposal.providerMetadata.model }),
        ...(proposal.providerMetadata?.usage === undefined ? {} : { usage: proposal.providerMetadata.usage }),
        fallback: usedFallback,
      };
      if (providerMetadata.model && providerMetadata.usage) this.deps.onUsage?.({ at: new Date().toISOString(), provider: providerMetadata.label, model: providerMetadata.model, usage: providerMetadata.usage, outcome: 'completed', fallback: providerMetadata.fallback });
      const providerLabel = providerMetadata.label;
      emit('validating');
      const calls = proposal.toolCalls.slice(0, 2);
      const auditMeta = { requestId, provider: providerMetadata.label, model: providerMetadata.model, ...(calls.length ? { tools: calls.map((call) => call.name) } : {}) };
      if (calls.length) this.audit({ type: 'tool.requested', ...auditMeta, at: new Date().toISOString(), summary: 'Tool action requested.' });
      const decision = await this.deps.policy.decide(calls);
      if (decision.kind === 'blocked') throw new Error(decision.reason);
      if (decision.kind === 'confirm') {
        emit('awaiting_confirmation');
        this.confirmationAudit.set(decision.confirmation.id, auditMeta);
        this.audit({ type: 'confirmation.requested', ...auditMeta, at: new Date().toISOString(), summary: 'Confirmation required.' });
        return { requestId, providerLabel, provider: providerMetadata, reply: proposal.reply, proposal, confirmation: decision.confirmation, toolResults: [] };
      }
      emit('executing');
      const { toolResults, partialFailure } = await this.executeCalls(calls, controller.signal, auditMeta);
      emit('completed');
      return { requestId, providerLabel, provider: providerMetadata, reply: partialFailure ? `${proposal.reply}\n\n${partialFailure}` : proposal.reply, proposal, toolResults, partialFailure };
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

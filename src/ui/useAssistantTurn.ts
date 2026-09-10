import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { assistantTurnReducer, dismissIntent, initialAssistantTurnState, type AssistantProvenance, type AssistantTurnState, type DismissIntent } from '../ai/assistant-turn';
import type { AiProviderFailure } from '../ai/contracts';
import { classifyProviderFailure } from '../ai/production';
import type { AiRuntimeResult, AiTurnRuntime } from '../ai/runtime';
import type { CompanionEvent } from '../companion/contracts';
import { referenceDate } from '../domain/date-context';
import type { StudyData } from '../domain/models';
import { companionEventFor, failurePresentationFor } from './assistant-presentation';

export type AssistantHost = Readonly<{
  runtime: AiTurnRuntime;
  data: StudyData;
  onEvent: (action: string, detail: string, result?: string) => void;
  onCompanionEvent?: (event: CompanionEvent) => void;
  onCompanionError?: (text: string) => void;
}>;

export type AssistantTurnControls = Readonly<{
  state: AssistantTurnState;
  ask: (message: string, options?: { useLocalFallback?: boolean }) => Promise<void>;
  confirm: () => Promise<void>;
  cancelConfirmation: () => Promise<void>;
  stop: () => void;
  retry: () => Promise<void>;
  useLocalFallback: () => Promise<void>;
  dismiss: () => DismissIntent;
  reset: () => void;
}>;

const failureFor = (error: unknown): AiProviderFailure => {
  if (typeof error === 'object' && error !== null && 'failure' in error) {
    const failure = (error as { failure?: unknown }).failure;
    if (typeof failure === 'object' && failure !== null && 'code' in failure && 'retryable' in failure) return failure as AiProviderFailure;
  }
  return classifyProviderFailure(error);
};
const provenanceOf = (result: AiRuntimeResult): AssistantProvenance => ({ provider: result.provider.label, ...(result.provider.model === undefined ? {} : { model: result.provider.model }), ...(result.provider.usage ? { totalTokens: result.provider.usage.totalTokens } : {}), ...(result.provider.fallback ? { fallback: true } : {}) });
const assistantRequestId = () => `assistant-${crypto.randomUUID().replace(/[^A-Za-z0-9_-]/g, '')}`;

// Um turno do assistente, do pedido à execução confirmada. A página Taby e a paleta usam o mesmo hook:
// o reducer decide as transições; aqui só se conversa com o runtime, o companion e a instrumentação.
export function useAssistantTurn({ runtime, data, onEvent, onCompanionEvent, onCompanionError }: AssistantHost): AssistantTurnControls {
  const [state, dispatch] = useReducer(assistantTurnReducer, initialAssistantTurnState);
  const activeRequestId = useRef<string | null>(null);
  const lastMessage = useRef('');
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => runtime.subscribeToStream(({ requestId, event }) => {
    if (activeRequestId.current !== requestId) return;
    if (event.type === 'started') dispatch({ type: 'stream.started', requestId, ...(event.provider === undefined ? {} : { provider: event.provider }), ...(event.model === undefined ? {} : { model: event.model }) });
    if (event.type === 'delta') dispatch({ type: 'stream.delta', requestId, delta: event.delta });
    if (event.type === 'usage') dispatch({ type: 'stream.usage', requestId, totalTokens: event.usage.totalTokens });
  }), [runtime]);

  const resolve = useCallback(async (actionId: 'confirm' | 'cancel') => {
    const current = stateRef.current;
    if (current.status !== 'confirmation') return;
    const { confirmation, requestId } = current;
    void window.hibiDesktop?.hideNotch?.(confirmation.id);
    if (actionId === 'cancel') {
      runtime.cancelConfirmation(confirmation);
      const text = 'Ação cancelada.';
      dispatch({ type: 'confirmation.cancelled', requestId, text });
      onEvent('assistant-action', 'confirmation-cancelled', 'cancelled');
      onCompanionEvent?.(companionEventFor('result', confirmation.id, text, Date.now()));
      return;
    }
    try {
      const result = await runtime.confirm(confirmation);
      const summary = result.partialFailure ?? (result.toolResults.map((item) => item.summary).join('\n') || 'Ação executada com sucesso.');
      dispatch({ type: 'confirmation.executed', requestId, summary, partialFailure: Boolean(result.partialFailure) });
      onEvent('assistant-action', summary, result.partialFailure ? 'partial-failure' : 'executed');
      onCompanionEvent?.(companionEventFor(result.partialFailure ? 'error' : 'result', confirmation.id, summary, Date.now()));
    } catch (error) {
      const text = error instanceof Error ? error.message : 'A ação não pôde ser executada.';
      dispatch({ type: 'confirmation.executed', requestId, summary: text, partialFailure: true });
      onEvent('assistant-action', text, 'blocked');
      onCompanionError?.(text);
      onCompanionEvent?.(companionEventFor('error', confirmation.id, text, Date.now()));
    }
  }, [runtime, onEvent, onCompanionEvent, onCompanionError]);

  useEffect(() => window.hibiDesktop?.onCompanionAction?.((action) => {
    const current = stateRef.current;
    if (current.status === 'confirmation' && action.requestId === current.confirmation.id) void resolve(action.actionId);
  }) ?? (() => undefined), []);

  const ask = useCallback(async (message: string, options: { useLocalFallback?: boolean } = {}) => {
    const trimmed = message.trim();
    if (!trimmed || stateRef.current.status === 'streaming') return;
    const useLocalFallback = options.useLocalFallback === true;
    const requestId = assistantRequestId();
    activeRequestId.current = requestId;
    lastMessage.current = trimmed;
    dispatch({ type: 'turn.started', requestId });
    onEvent('assistant-query', trimmed, useLocalFallback ? 'local-fallback' : 'requested');
    onCompanionEvent?.(companionEventFor('listening', requestId, 'Ouvindo…', Date.now()));
    try {
      const result = await runtime.runTurn({ message: trimmed, surface: 'desktop', requestId, useLocalFallback, now: new Date(`${referenceDate(data)}T09:00:00-03:00`) });
      if (activeRequestId.current !== requestId) return;
      if (result.confirmation) {
        const text = `${result.reply}\n\nConfirme para continuar.`;
        dispatch({ type: 'turn.confirmation', requestId, confirmation: result.confirmation, text, provenance: provenanceOf(result) });
        onCompanionEvent?.(companionEventFor('confirmation', result.confirmation.id, text, Date.now()));
        onEvent('assistant-action', result.confirmation.calls.map((call) => call.name).join(', '), 'confirmation-required');
        return;
      }
      const details = result.toolResults.map((item) => item.summary).join('\n') || result.reply;
      dispatch({ type: 'turn.replied', requestId, text: details, provenance: provenanceOf(result) });
      onEvent('assistant-query', result.providerLabel, 'completed');
      onCompanionEvent?.(companionEventFor('result', result.requestId, details, Date.now()));
    } catch (error) {
      if (activeRequestId.current !== requestId) return;
      const failure = failureFor(error);
      if (failure.code === 'cancelled') {
        const text = 'Solicitação cancelada. Nenhuma ação foi executada.';
        dispatch({ type: 'turn.cancelled', requestId, text });
        onEvent('assistant-query', text, 'cancelled');
        onCompanionEvent?.(companionEventFor('result', requestId, text, Date.now()));
        return;
      }
      dispatch({ type: 'turn.failed', requestId, message: trimmed, failure });
      onEvent('assistant-query', failure.code, 'failed');
      const presentation = failurePresentationFor(failure);
      onCompanionError?.(presentation.title);
      onCompanionEvent?.(companionEventFor('error', requestId, presentation.title, Date.now()));
    } finally {
      if (activeRequestId.current === requestId) activeRequestId.current = null;
    }
  }, [runtime, data, onEvent, onCompanionEvent, onCompanionError]);

  const stop = useCallback(() => {
    const current = stateRef.current;
    if (current.status !== 'streaming') return;
    dispatch({ type: 'cancel.requested', requestId: current.requestId });
    runtime.cancel();
  }, [runtime]);

  const dismiss = useCallback((): DismissIntent => {
    const intent = dismissIntent(stateRef.current);
    if (intent === 'cancel-confirmation') void resolve('cancel');
    if (intent === 'stop-stream') stop();
    return intent;
  }, [resolve, stop]);

  const retry = useCallback(() => stateRef.current.status === 'failure' ? ask(lastMessage.current) : Promise.resolve(), [ask]);
  const useLocalFallback = useCallback(() => stateRef.current.status === 'failure' ? ask(lastMessage.current, { useLocalFallback: true }) : Promise.resolve(), [ask]);

  return useMemo<AssistantTurnControls>(() => ({
    state,
    ask,
    confirm: () => resolve('confirm'),
    cancelConfirmation: () => resolve('cancel'),
    stop,
    retry,
    useLocalFallback,
    dismiss,
    reset: () => dispatch({ type: 'reset' }),
  }), [state, ask, resolve, stop, retry, useLocalFallback, dismiss]);
}

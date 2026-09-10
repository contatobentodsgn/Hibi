import React, { useEffect, useRef, useState } from 'react';
import { LOCAL_CAPABILITIES } from '../domain/capabilities';
import type { StudyData } from '../domain/models';
import { referenceDate } from '../domain/date-context';
import { AiTurnRuntime } from '../ai/runtime';
import type { Confirmation } from '../ai/policy';
import type { CompanionEvent } from '../companion/contracts';
import type { AiProviderFailure } from '../ai/contracts';
import { classifyProviderFailure } from '../ai/production';

type Props = { data: StudyData; runtime: AiTurnRuntime; onEvent: (action: string, detail: string, result?: string) => void; onCompanionError?: (text: string) => void; onCompanionEvent?: (event: CompanionEvent) => void };
type PendingConfirmation = Readonly<{ confirmation: Confirmation; text: string }>;
type Message = Readonly<{ role: 'user' | 'assistant'; text: string; provenance?: string }>;
type LiveReply = Readonly<{ requestId: string; text: string; provider?: string; model?: string; usage?: { totalTokens: number } }>;
type PendingFailure = Readonly<{ message: string; failure: AiProviderFailure }>;
export const confirmationPresentationFor = (requestId: string, text: string) => ({ requestId, kind: 'confirmation', text, interaction: 'capture' as const, actions: [{ id: 'confirm', label: 'Confirmar' }, { id: 'cancel', label: 'Cancelar' }] });
export const modelLabelFor = (result: { providerLabel: string; proposal: { providerMetadata?: { model?: string } } }) => result.proposal.providerMetadata?.model ?? result.providerLabel;
export const provenanceLabelFor = (result: { provider: { label: string; model?: string; usage?: { inputTokens?: number; outputTokens?: number; totalTokens: number }; fallback: boolean } }) => [result.provider.label, result.provider.model, result.provider.usage ? `${result.provider.usage.totalTokens} tokens` : undefined, result.provider.fallback ? 'local fallback' : undefined].filter((value): value is string => Boolean(value)).join(' · ');
export const failurePresentationFor = (failure: AiProviderFailure) => {
  if (failure.code === 'invalid_credentials') return { title: 'Check the API key', detail: 'The configured provider rejected its credentials. Your key remains in Keychain.', canRetry: false, canUseLocalFallback: true };
  if (failure.code === 'rate_limited') return { title: 'Rate limit reached', detail: `The provider is temporarily limiting requests.${failure.retryAfterMs ? ` Try again in about ${Math.max(1, Math.ceil(failure.retryAfterMs / 1_000))} seconds.` : ''}`, canRetry: true, canUseLocalFallback: true };
  if (failure.code === 'unavailable') return { title: 'Provider unavailable', detail: 'The provider is temporarily unavailable. You can retry or continue locally.', canRetry: true, canUseLocalFallback: true };
  if (failure.code === 'cancelled') return { title: 'Request cancelled', detail: 'No action was performed.', canRetry: true, canUseLocalFallback: false };
  return { title: 'Invalid provider response', detail: 'The provider returned an invalid response. No action was performed.', canRetry: true, canUseLocalFallback: true };
};
const failureFor = (error: unknown): AiProviderFailure => {
  if (typeof error === 'object' && error !== null && 'failure' in error) {
    const failure = (error as { failure?: unknown }).failure;
    if (typeof failure === 'object' && failure !== null && 'code' in failure && 'retryable' in failure) return failure as AiProviderFailure;
  }
  return classifyProviderFailure(error);
};
const assistantRequestId = () => `assistant-${crypto.randomUUID().replace(/[^A-Za-z0-9_-]/g, '')}`;
export const companionEventFor = (kind: 'listening' | 'thinking' | 'acting' | 'confirmation' | 'result' | 'error', requestId: string, text: string, nowMs: number): CompanionEvent => {
  if (kind === 'confirmation') return { type: 'confirmation.requested', requestId, text, nowMs, expiresInMs: 60_000, actions: confirmationPresentationFor(requestId, text).actions };
  if (kind === 'result') return { type: 'ai.result', requestId, text, nowMs, expiresInMs: 4_000 };
  if (kind === 'error') return { type: 'error.raised', requestId, text, nowMs, expiresInMs: 5_000 };
  return { type: 'ai.stage', requestId, stage: kind, text, nowMs };
};

export function TabyView({ data, runtime, onEvent, onCompanionError, onCompanionEvent }: Props) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', text: 'Olá! Sou o assistente local do Hibi. Posso consultar e organizar seu espaço de trabalho.', provenance: 'Hibi local tools · local-tool-provider' }]);
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const [live, setLive] = useState<LiveReply | null>(null);
  const [pendingFailure, setPendingFailure] = useState<PendingFailure | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [cancelRequested, setCancelRequested] = useState(false);
  const activeRequestId = useRef<string | null>(null);
  useEffect(() => runtime.subscribeToStream(({ requestId, event }) => {
    if (activeRequestId.current !== requestId) return;
    setLive((current) => {
      const value = current?.requestId === requestId ? current : { requestId, text: '' };
      if (event.type === 'started') return { ...value, ...(event.provider === undefined ? {} : { provider: event.provider }), ...(event.model === undefined ? {} : { model: event.model }) };
      if (event.type === 'delta') return { ...value, text: `${value.text}${event.delta}` };
      if (event.type === 'usage') return { ...value, usage: event.usage };
      return value;
    });
  }), [runtime]);
  const resolvePending = async (actionId: 'confirm' | 'cancel') => {
    if (!pending) return;
    const confirmation = pending.confirmation;
    setPending(null);
    if (actionId === 'cancel') { runtime.cancelConfirmation(confirmation); const text = 'Ação cancelada.'; setMessages((current) => [...current, { role: 'assistant', text }]); onEvent('assistant-action', 'confirmation-cancelled', 'cancelled'); onCompanionEvent?.(companionEventFor('result', confirmation.id, text, Date.now())); return; }
    try {
      const result = await runtime.confirm(confirmation);
      const summary = result.partialFailure ?? (result.toolResults.map((item) => item.summary).join('\n') || 'Ação executada com sucesso.');
      setMessages((current) => [...current, { role: 'assistant', text: summary }]); onEvent('assistant-action', summary, result.partialFailure ? 'partial-failure' : 'executed'); onCompanionEvent?.(companionEventFor(result.partialFailure ? 'error' : 'result', confirmation.id, summary, Date.now()));
    } catch (error) { const text = error instanceof Error ? error.message : 'A ação não pôde ser executada.'; setMessages((current) => [...current, { role: 'assistant', text }]); onEvent('assistant-action', text, 'blocked'); onCompanionError?.(text); onCompanionEvent?.(companionEventFor('error', confirmation.id, text, Date.now())); }
  };
  useEffect(() => window.hibiDesktop?.onCompanionAction?.((action) => { if (action.requestId === pending?.confirmation.id) void resolvePending(action.actionId); }) ?? (() => undefined), [pending]);
  const ask = async (requestedMessage?: string, useLocalFallback = false, includeUserMessage = true) => {
    const message = (requestedMessage ?? input).trim(); if (!message || isRunning) return;
    const requestId = assistantRequestId();
    activeRequestId.current = requestId;
    setLive({ requestId, text: '' }); setPendingFailure(null); setIsRunning(true); setCancelRequested(false);
    if (includeUserMessage) setMessages((current) => [...current, { role: 'user', text: message }]);
    setInput(''); onEvent('assistant-query', message, useLocalFallback ? 'local-fallback' : 'requested'); onCompanionEvent?.(companionEventFor('listening', requestId, 'Ouvindo…', Date.now()));
    try {
      const result = await runtime.runTurn({ message, surface: 'desktop', requestId, useLocalFallback, now: new Date(`${referenceDate(data)}T09:00:00-03:00`) });
      if (activeRequestId.current !== requestId) return;
      setLive(null); setIsRunning(false);
      if (result.confirmation) {
        const text = `${result.reply}\n\nConfirme para continuar.`;
        setPending({ confirmation: result.confirmation, text }); setMessages((current) => [...current, { role: 'assistant', text, provenance: provenanceLabelFor(result) }]);
        onCompanionEvent?.(companionEventFor('confirmation', result.confirmation.id, text, Date.now()));
        onEvent('assistant-action', result.confirmation.calls.map((call) => call.name).join(', '), 'confirmation-required');
        return;
      }
      const details = result.toolResults.map((item) => item.summary).join('\n');
      setMessages((current) => [...current, { role: 'assistant', text: details || result.reply, provenance: provenanceLabelFor(result) }]);
      onEvent('assistant-query', result.providerLabel, 'completed'); onCompanionEvent?.(companionEventFor('result', result.requestId, details || result.reply, Date.now()));
    } catch (error) {
      if (activeRequestId.current !== requestId) return;
      const failure = failureFor(error);
      setLive(null); setIsRunning(false);
      if (failure.code === 'cancelled') {
        const text = 'Solicitação cancelada. Nenhuma ação foi executada.';
        setMessages((current) => [...current, { role: 'assistant', text }]);
        onEvent('assistant-query', text, 'cancelled');
        onCompanionEvent?.(companionEventFor('result', requestId, text, Date.now()));
        return;
      }
      const presentation = failurePresentationFor(failure);
      setPendingFailure({ message, failure });
      onEvent('assistant-query', failure.code, 'failed'); onCompanionError?.(presentation.title); onCompanionEvent?.(companionEventFor('error', requestId, presentation.title, Date.now()));
    } finally {
      if (activeRequestId.current === requestId) activeRequestId.current = null;
    }
  };
  const failure = pendingFailure ? failurePresentationFor(pendingFailure.failure) : null;
  return <div className="view"><div className="view-heading"><div><p className="eyebrow">TABY · LOCAL TOOLS</p><h1>Local assistant</h1><p className="muted">Ações usam ferramentas locais validadas e confirmações explícitas. O modo local não usa rede; um provedor configurado pode usar seu endpoint.</p></div></div><section className="list-card" aria-label="Assistant capabilities"><div className="task-row"><span className="tag orange">status</span><div><strong>What I can access</strong><p className="muted">Only the local workspace data and controls listed here.</p></div></div>{LOCAL_CAPABILITIES.map((capability) => <div className="task-row" key={capability.id}><span className={`tag ${capability.status === 'available' ? 'green' : 'muted'}`}>{capability.status}</span><div><strong>{capability.label}</strong><p className="muted">{capability.description}</p></div></div>)}</section><section className="list-card" aria-live="polite">{messages.map((message, index) => <div className="task-row" key={`${message.role}-${index}`}><span className="tag orange">{message.role}</span><div><span>{message.text}</span>{message.provenance && <small className="muted" style={{ display: 'block', marginTop: 4 }}>{message.provenance}</small>}</div></div>)}{live && <div className="task-row" role="status"><span className="tag orange">streaming</span><div><strong>{live.text || (cancelRequested ? 'Cancelando…' : 'Gerando resposta…')}</strong>{(live.provider || live.model || live.usage) && <small className="muted" style={{ display: 'block', marginTop: 4 }}>{[live.provider, live.model, live.usage ? `${live.usage.totalTokens} tokens` : undefined].filter(Boolean).join(' · ')}</small>}</div></div>}{pending && <div className="task-row" role="alert"><span className="tag amber">confirmation</span><div><strong>{pending.text}</strong><div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button className="primary" onClick={() => { void window.hibiDesktop?.hideNotch?.(pending.confirmation.id); void resolvePending('confirm'); }}>Confirmar</button><button className="outline" onClick={() => { void window.hibiDesktop?.hideNotch?.(pending.confirmation.id); void resolvePending('cancel'); }}>Cancelar</button></div></div></div>}{failure && pendingFailure && <div className="task-row" role="alert"><span className="tag amber">provider</span><div><strong>{failure.title}</strong><p className="muted">{failure.detail}</p><div style={{ display: 'flex', gap: 8, marginTop: 10 }}>{failure.canRetry && <button className="outline" onClick={() => void ask(pendingFailure.message, false, false)}>Tentar novamente</button>}{failure.canUseLocalFallback && <button className="primary" onClick={() => void ask(pendingFailure.message, true, false)}>Usar assistente local</button>}</div></div></div>}</section><div className="quick-input"><input disabled={isRunning} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void ask(); }} placeholder="Pergunte ou peça uma ação" aria-label="Pergunte ou peça uma ação" /><button className="primary" disabled={isRunning} onClick={() => void ask()}>Send</button>{isRunning && <button className="outline" onClick={() => { setCancelRequested(true); runtime.cancel(); }}>Parar</button>}</div></div>;
}

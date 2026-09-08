import React, { useEffect, useState } from 'react';
import { LOCAL_CAPABILITIES } from '../domain/capabilities';
import type { StudyData } from '../domain/models';
import { referenceDate } from '../domain/date-context';
import { AiTurnRuntime } from '../ai/runtime';
import type { Confirmation } from '../ai/policy';
import type { CompanionEvent } from '../companion/contracts';

type Props = { data: StudyData; runtime: AiTurnRuntime; onEvent: (action: string, detail: string, result?: string) => void; onCompanionError?: (text: string) => void; onCompanionEvent?: (event: CompanionEvent) => void };
type PendingConfirmation = Readonly<{ confirmation: Confirmation; text: string }>;
type Message = Readonly<{ role: string; text: string; model?: string }>;
export const confirmationPresentationFor = (requestId: string, text: string) => ({ requestId, kind: 'confirmation', text, interaction: 'capture' as const, actions: [{ id: 'confirm', label: 'Confirmar' }, { id: 'cancel', label: 'Cancelar' }] });
export const modelLabelFor = (result: { providerLabel: string; proposal: { providerMetadata?: { model?: string } } }) => result.proposal.providerMetadata?.model ?? result.providerLabel;
export const companionEventFor = (kind: 'listening' | 'thinking' | 'acting' | 'confirmation' | 'result' | 'error', requestId: string, text: string, nowMs: number): CompanionEvent => {
  if (kind === 'confirmation') return { type: 'confirmation.requested', requestId, text, nowMs, expiresInMs: 60_000, actions: confirmationPresentationFor(requestId, text).actions };
  if (kind === 'result') return { type: 'ai.result', requestId, text, nowMs, expiresInMs: 4_000 };
  if (kind === 'error') return { type: 'error.raised', requestId, text, nowMs, expiresInMs: 5_000 };
  return { type: 'ai.stage', requestId, stage: kind, text, nowMs };
};

export function TabyView({ data, runtime, onEvent, onCompanionError, onCompanionEvent }: Props) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', text: 'Olá! Sou o assistente local do Hibi. Posso consultar e organizar seu espaço de trabalho.', model: 'local-tool-provider' }]);
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
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
  const ask = async () => {
    const message = input.trim(); if (!message) return;
    const requestId = `assistant-${crypto.randomUUID()}`;
    setMessages((current) => [...current, { role: 'user', text: message }]); setInput(''); onEvent('assistant-query', message, 'local-tools'); onCompanionEvent?.(companionEventFor('listening', requestId, 'Ouvindo…', Date.now()));
    try {
      const result = await runtime.runTurn({ message, surface: 'desktop', now: new Date(`${referenceDate(data)}T09:00:00-03:00`) });
      if (result.confirmation) {
        const text = `${result.reply}\n\nConfirme para continuar.`;
        setPending({ confirmation: result.confirmation, text }); setMessages((current) => [...current, { role: 'assistant', text, model: modelLabelFor(result) }]);
        onCompanionEvent?.(companionEventFor('confirmation', result.confirmation.id, text, Date.now()));
        onEvent('assistant-action', result.confirmation.calls.map((call) => call.name).join(', '), 'confirmation-required');
        return;
      }
      const details = result.toolResults.map((item) => item.summary).join('\n');
      setMessages((current) => [...current, { role: 'assistant', text: details || result.reply, model: modelLabelFor(result) }]);
      onEvent('assistant-query', result.providerLabel, 'completed'); onCompanionEvent?.(companionEventFor('result', result.requestId, details || result.reply, Date.now()));
    } catch (error) { const text = error instanceof Error ? error.message : 'Não foi possível concluir essa solicitação.'; setMessages((current) => [...current, { role: 'assistant', text }]); onEvent('assistant-query', text, 'failed'); onCompanionError?.(text); onCompanionEvent?.(companionEventFor('error', requestId, text, Date.now())); }
  };
  return <div className="view"><div className="view-heading"><div><p className="eyebrow">TABY · LOCAL TOOLS</p><h1>Local assistant</h1><p className="muted">Ações usam ferramentas locais validadas e confirmações explícitas. O modo local não usa rede; um provedor configurado pode usar seu endpoint.</p></div></div><section className="list-card" aria-label="Assistant capabilities"><div className="task-row"><span className="tag orange">status</span><div><strong>What I can access</strong><p className="muted">Only the local workspace data and controls listed here.</p></div></div>{LOCAL_CAPABILITIES.map((capability) => <div className="task-row" key={capability.id}><span className={`tag ${capability.status === 'available' ? 'green' : 'muted'}`}>{capability.status}</span><div><strong>{capability.label}</strong><p className="muted">{capability.description}</p></div></div>)}</section><section className="list-card" aria-live="polite">{messages.map((message, index) => <div className="task-row" key={`${message.role}-${index}`}><span className="tag orange">{message.role}</span><div><span>{message.text}</span>{message.model && <small className="muted" style={{ display: 'block', marginTop: 4 }}>Model: {message.model}</small>}</div></div>)}{pending && <div className="task-row" role="alert"><span className="tag amber">confirmation</span><div><strong>{pending.text}</strong><div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button className="primary" onClick={() => { void window.hibiDesktop?.hideNotch?.(pending.confirmation.id); void resolvePending('confirm'); }}>Confirmar</button><button className="outline" onClick={() => { void window.hibiDesktop?.hideNotch?.(pending.confirmation.id); void resolvePending('cancel'); }}>Cancelar</button></div></div></div>}</section><div className="quick-input"><input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void ask(); }} placeholder="Pergunte ou peça uma ação" aria-label="Pergunte ou peça uma ação" /><button className="primary" onClick={() => void ask()}>Send</button></div></div>;
}

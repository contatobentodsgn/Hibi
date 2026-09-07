import React, { useEffect, useState } from 'react';
import { LOCAL_CAPABILITIES } from '../domain/capabilities';
import type { StudyData } from '../domain/models';
import { referenceDate } from '../domain/date-context';
import { AiTurnRuntime } from '../ai/runtime';
import type { Confirmation } from '../ai/policy';

type Props = { data: StudyData; runtime: AiTurnRuntime; onEvent: (action: string, detail: string, result?: string) => void };
type PendingConfirmation = Readonly<{ confirmation: Confirmation; text: string }>;
export const confirmationPresentationFor = (requestId: string, text: string) => ({ requestId, kind: 'confirmation', text, interaction: 'capture' as const, actions: [{ id: 'confirm', label: 'Confirmar' }, { id: 'cancel', label: 'Cancelar' }] });

export function TabyView({ data, runtime, onEvent }: Props) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([{ role: 'assistant', text: 'Olá! Sou o assistente local do Hibi. Posso consultar e organizar seu espaço de trabalho.' }]);
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const resolvePending = async (actionId: 'confirm' | 'cancel') => {
    if (!pending) return;
    const confirmation = pending.confirmation;
    setPending(null);
    if (actionId === 'cancel') { runtime.cancelConfirmation(confirmation); setMessages((current) => [...current, { role: 'assistant', text: 'Ação cancelada.' }]); onEvent('assistant-action', 'confirmation-cancelled', 'cancelled'); return; }
    try {
      const result = await runtime.confirm(confirmation);
      const summary = result.partialFailure ?? (result.toolResults.map((item) => item.summary).join('\n') || 'Ação executada com sucesso.');
      setMessages((current) => [...current, { role: 'assistant', text: summary }]); onEvent('assistant-action', summary, result.partialFailure ? 'partial-failure' : 'executed');
    } catch (error) { const text = error instanceof Error ? error.message : 'A ação não pôde ser executada.'; setMessages((current) => [...current, { role: 'assistant', text }]); onEvent('assistant-action', text, 'blocked'); }
  };
  useEffect(() => window.hibiDesktop?.onCompanionAction?.((action) => { if (action.requestId === pending?.confirmation.id) void resolvePending(action.actionId); }) ?? (() => undefined), [pending]);
  const ask = async () => {
    const message = input.trim(); if (!message) return;
    setMessages((current) => [...current, { role: 'user', text: message }]); setInput(''); onEvent('assistant-query', message, 'local-tools');
    try {
      const result = await runtime.runTurn({ message, surface: 'desktop', now: new Date(`${referenceDate(data)}T09:00:00-03:00`) });
      if (result.confirmation) {
        const text = `${result.reply}\n\nConfirme para continuar.`;
        setPending({ confirmation: result.confirmation, text }); setMessages((current) => [...current, { role: 'assistant', text }]);
        void window.hibiDesktop?.showNotch?.(confirmationPresentationFor(result.confirmation.id, text));
        onEvent('assistant-action', result.confirmation.calls.map((call) => call.name).join(', '), 'confirmation-required');
        return;
      }
      const details = result.toolResults.map((item) => item.summary).join('\n');
      setMessages((current) => [...current, { role: 'assistant', text: details || result.reply }]);
      onEvent('assistant-query', result.providerLabel, 'completed');
    } catch (error) { const text = error instanceof Error ? error.message : 'Não foi possível concluir essa solicitação.'; setMessages((current) => [...current, { role: 'assistant', text }]); onEvent('assistant-query', text, 'failed'); }
  };
  return <div className="view"><div className="view-heading"><div><p className="eyebrow">TABY · LOCAL TOOLS</p><h1>Local assistant</h1><p className="muted">Ações usam ferramentas locais validadas e confirmações explícitas. No network calls.</p></div></div><section className="list-card" aria-label="Assistant capabilities"><div className="task-row"><span className="tag orange">status</span><div><strong>What I can access</strong><p className="muted">Only the local workspace data and controls listed here.</p></div></div>{LOCAL_CAPABILITIES.map((capability) => <div className="task-row" key={capability.id}><span className={`tag ${capability.status === 'available' ? 'green' : 'muted'}`}>{capability.status}</span><div><strong>{capability.label}</strong><p className="muted">{capability.description}</p></div></div>)}</section><section className="list-card" aria-live="polite">{messages.map((message, index) => <div className="task-row" key={`${message.role}-${index}`}><span className="tag orange">{message.role}</span><div><span>{message.text}</span></div></div>)}{pending && <div className="task-row" role="alert"><span className="tag amber">confirmation</span><div><strong>{pending.text}</strong><div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button className="primary" onClick={() => { void window.hibiDesktop?.hideNotch?.(pending.confirmation.id); void resolvePending('confirm'); }}>Confirmar</button><button className="outline" onClick={() => { void window.hibiDesktop?.hideNotch?.(pending.confirmation.id); void resolvePending('cancel'); }}>Cancelar</button></div></div></div>}</section><div className="quick-input"><input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void ask(); }} placeholder="Pergunte ou peça uma ação" /><button className="primary" onClick={() => void ask()}>Send</button></div></div>;
}

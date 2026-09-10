import React, { useEffect, useRef, useState } from 'react';
import { LOCAL_CAPABILITIES } from '../domain/capabilities';
import type { StudyData } from '../domain/models';
import { AiTurnRuntime } from '../ai/runtime';
import { provenanceLabel } from '../ai/assistant-turn';
import type { CompanionEvent } from '../companion/contracts';
import { failurePresentationFor } from './assistant-presentation';
import { useAssistantTurn } from './useAssistantTurn';

type Props = { data: StudyData; runtime: AiTurnRuntime; onEvent: (action: string, detail: string, result?: string) => void; onCompanionError?: (text: string) => void; onCompanionEvent?: (event: CompanionEvent) => void };
type Message = Readonly<{ role: 'user' | 'assistant'; text: string; provenance?: string }>;

export function TabyView({ data, runtime, onEvent, onCompanionError, onCompanionEvent }: Props) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', text: 'Olá! Sou o assistente local do Hibi. Posso consultar e organizar seu espaço de trabalho.', provenance: 'Hibi local tools · local-tool-provider' }]);
  const turn = useAssistantTurn({ runtime, data, onEvent, onCompanionEvent, onCompanionError });
  const { state } = turn;
  const handled = useRef('');

  // Cada transição terminal vira uma mensagem no histórico da página, uma vez só.
  useEffect(() => {
    if (state.status === 'idle' || state.status === 'streaming' || state.status === 'failure') return;
    const key = `${state.status}:${state.requestId}`;
    if (handled.current === key) return;
    handled.current = key;
    if (state.status === 'replied') setMessages((current) => [...current, { role: 'assistant', text: state.text, provenance: provenanceLabel(state.provenance) }]);
    if (state.status === 'confirmation') setMessages((current) => [...current, { role: 'assistant', text: state.text, provenance: provenanceLabel(state.provenance) }]);
    if (state.status === 'executed') setMessages((current) => [...current, { role: 'assistant', text: state.summary }]);
    if (state.status === 'cancelled') setMessages((current) => [...current, { role: 'assistant', text: state.text }]);
  }, [state]);

  const send = () => { const message = input.trim(); if (!message || state.status === 'streaming') return; setMessages((current) => [...current, { role: 'user', text: message }]); setInput(''); void turn.ask(message); };
  const isRunning = state.status === 'streaming';
  const failure = state.status === 'failure' ? failurePresentationFor(state.failure) : null;

  return <div className="view"><div className="view-heading"><div><p className="eyebrow">TABY · LOCAL TOOLS</p><h1>Local assistant</h1><p className="muted">Ações usam ferramentas locais validadas e confirmações explícitas. O modo local não usa rede; um provedor configurado pode usar seu endpoint.</p></div></div><section className="list-card" aria-label="Assistant capabilities"><div className="task-row"><span className="tag orange">status</span><div><strong>What I can access</strong><p className="muted">Only the local workspace data and controls listed here.</p></div></div>{LOCAL_CAPABILITIES.map((capability) => <div className="task-row" key={capability.id}><span className={`tag ${capability.status === 'available' ? 'green' : 'muted'}`}>{capability.status}</span><div><strong>{capability.label}</strong><p className="muted">{capability.description}</p></div></div>)}</section><section className="list-card" aria-live="polite">{messages.map((message, index) => <div className="task-row" key={`${message.role}-${index}`}><span className="tag orange">{message.role}</span><div><span>{message.text}</span>{message.provenance && <small className="muted" style={{ display: 'block', marginTop: 4 }}>{message.provenance}</small>}</div></div>)}{state.status === 'streaming' && <div className="task-row" role="status"><span className="tag orange">streaming</span><div><strong>{state.text || (state.cancelRequested ? 'Cancelando…' : 'Gerando resposta…')}</strong>{provenanceLabel(state.provenance) && <small className="muted" style={{ display: 'block', marginTop: 4 }}>{provenanceLabel(state.provenance)}</small>}</div></div>}{state.status === 'confirmation' && <div className="task-row" role="alert"><span className="tag amber">confirmation</span><div><strong>{state.text}</strong><div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button className="primary" onClick={() => void turn.confirm()}>Confirmar</button><button className="outline" onClick={() => void turn.cancelConfirmation()}>Cancelar</button></div></div></div>}{failure && <div className="task-row" role="alert"><span className="tag amber">provider</span><div><strong>{failure.title}</strong><p className="muted">{failure.detail}</p><div style={{ display: 'flex', gap: 8, marginTop: 10 }}>{failure.canRetry && <button className="outline" onClick={() => void turn.retry()}>Tentar novamente</button>}{failure.canUseLocalFallback && <button className="primary" onClick={() => void turn.useLocalFallback()}>Usar assistente local</button>}</div></div></div>}</section><div className="quick-input"><input disabled={isRunning} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') send(); }} placeholder="Pergunte ou peça uma ação" aria-label="Pergunte ou peça uma ação" /><button className="primary" disabled={isRunning} onClick={send}>Send</button>{isRunning && <button className="outline" onClick={turn.stop}>Parar</button>}</div></div>;
}

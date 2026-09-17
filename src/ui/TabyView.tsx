import React, { useEffect, useState } from 'react';
import { LOCAL_CAPABILITIES } from '../domain/capabilities';
import type { StudyData } from '../domain/models';
import { provenanceLabel } from '../ai/assistant-turn';
import { useT } from '../i18n/LocaleProvider';
import { failurePresentationFor } from './assistant-presentation';
import { ConversationList } from './ConversationList';
import { TabyAtelierStatus } from './TabyAtelierStatus';
import { WorkspaceState } from './WorkspaceState';
import type { AssistantTurnControls } from './useAssistantTurn';
import type { ConversationsController } from './useConversations';

type Props = { data: StudyData; turn: AssistantTurnControls; conversations: ConversationsController };

export function TabyView({ data, turn, conversations }: Props) {
  const t = useT();
  const [input, setInput] = useState('');
  // A voz existe só no app de desktop, e o reconhecimento roda neste Mac: o helper nativo recusa
  // quando o idioma não tem modelo no dispositivo, em vez de mandar o áudio para fora.
  const [listening, setListening] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState('');
  useEffect(() => window.hibiDesktop?.onLocalVoiceText?.((text) => setInput(text)) ?? (() => undefined), []);
  const toggleVoice = async () => {
    if (listening) { await window.hibiDesktop?.stopLocalVoice?.(); setListening(false); return; }
    const bridge = window.hibiDesktop?.listenLocalVoice;
    if (!bridge) { setVoiceNotice(t('taby.voice.unavailable')); return; }
    setListening(true);
    setVoiceNotice('');
    const result = await bridge().catch(() => null);
    if (result?.status !== 'listening') { setListening(false); setVoiceNotice(result?.error ?? t('taby.voice.unavailable')); }
  };
  const { state } = turn;
  // A thread exibida é a da conversa ativa. Esta tela não escreve nela a partir do turno: quem grava
  // é o useConversations, montado no App — a paleta também pergunta, e com esta tela desmontada.
  const messages = conversations.conversations.find((conversation) => conversation.id === conversations.activeId)?.messages ?? [];
  const activeConversation = conversations.conversations.find((conversation) => conversation.id === conversations.activeId);

  const send = () => { const message = input.trim(); if (!message || state.status === 'streaming') return; conversations.record({ role: 'user', text: message, at: new Date().toISOString() }); setInput(''); void turn.ask(message); };
  const isRunning = state.status === 'streaming';
  const failure = state.status === 'failure' ? failurePresentationFor(state.failure) : null;

  return <div className="view"><div className="view-heading"><div><p className="eyebrow">TABY · LOCAL TOOLS</p><h1>Local assistant</h1><p className="muted">Ações usam ferramentas locais validadas e confirmações explícitas. O modo local não usa rede; um provedor configurado pode usar seu endpoint.</p></div></div><TabyAtelierStatus title={activeConversation?.title} messageCount={messages.length} state={state} /><section className="list-card" aria-label="Assistant capabilities"><div className="task-row"><span className="tag orange">status</span><div><strong>What I can access</strong><p className="muted">Only the local workspace data and controls listed here.</p></div></div>{LOCAL_CAPABILITIES.map((capability) => <div className="task-row" key={capability.id}><span className={`tag ${capability.status === 'available' ? 'green' : 'muted'}`}>{capability.status}</span><div><strong>{capability.label}</strong><p className="muted">{capability.description}</p></div></div>)}</section><ConversationList conversations={conversations.conversations} activeId={conversations.activeId} query={conversations.query} onSelect={conversations.select} onSearch={conversations.search} onCreate={conversations.create} onDelete={conversations.remove} onDeleteAll={() => { if (window.confirm(t('taby.deleteAllConfirm'))) conversations.removeAll(); }} />{conversations.saveFailed && <WorkspaceState title={t('taby.saveFailed')} />}<section className="list-card" aria-live="polite"><div className="task-row"><span className="tag orange">assistant</span><div><span>{t('taby.greeting')}</span><small className="muted" style={{ display: 'block', marginTop: 4 }}>Hibi local tools · local-tool-provider</small></div></div>{messages.map((message, index) => <div className="task-row" key={`${message.role}-${index}`}><span className="tag orange">{message.role}</span><div><span>{message.text}</span>{message.provenance && <small className="muted" style={{ display: 'block', marginTop: 4 }}>{message.provenance}</small>}</div></div>)}{state.status === 'streaming' && <div className="task-row" role="status"><span className="tag orange">streaming</span><div><strong>{state.text || (state.cancelRequested ? 'Cancelando…' : 'Gerando resposta…')}</strong>{provenanceLabel(state.provenance) && <small className="muted" style={{ display: 'block', marginTop: 4 }}>{provenanceLabel(state.provenance)}</small>}</div></div>}{state.status === 'confirmation' && <div className="task-row" role="alert"><span className="tag amber">confirmation</span><div><strong>{state.text}</strong><div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button className="primary" onClick={() => void turn.confirm()}>Confirmar</button><button className="outline" onClick={() => void turn.cancelConfirmation()}>Cancelar</button></div></div></div>}{failure && <div className="task-row" role="alert"><span className="tag amber">provider</span><div><strong>{failure.title}</strong><p className="muted">{failure.detail}</p><div style={{ display: 'flex', gap: 8, marginTop: 10 }}>{failure.canRetry && <button className="outline" onClick={() => void turn.retry()}>Tentar novamente</button>}{failure.canUseLocalFallback && <button className="primary" onClick={() => void turn.useLocalFallback()}>Usar assistente local</button>}</div></div></div>}</section><div className="quick-input"><input disabled={isRunning} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') send(); }} placeholder="Pergunte ou peça uma ação" aria-label="Pergunte ou peça uma ação" /><button className={listening ? 'outline' : 'primary'} disabled={isRunning} aria-pressed={listening} onClick={() => void toggleVoice()}>{listening ? t('taby.voice.stop') : t('taby.voice.start')}</button><button className="primary" disabled={isRunning} onClick={send}>Send</button>{isRunning && <button className="outline" onClick={turn.stop}>Parar</button>}</div>{voiceNotice && <p className="muted" role="status" aria-live="polite">{voiceNotice}</p>}</div>;
}

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
type LocalModelState = { status: string; modelId: string | null; error: string | null };

export function TabyView({ turn, conversations }: Props) {
  const t = useT();
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [localModel, setLocalModel] = useState<LocalModelState>({ status: 'unavailable', modelId: null, error: null });
  const { state } = turn;
  const activeConversation = conversations.conversations.find((item) => item.id === conversations.activeId);
  const messages = activeConversation?.messages ?? [];
  const isRunning = state.status === 'streaming';
  const failure = state.status === 'failure' ? failurePresentationFor(state.failure) : null;
  useEffect(() => { let active = true; void window.hibiDesktop?.getLocalModelState?.().then((value) => { if (active && value) setLocalModel(value); }).catch(() => {}); return () => { active = false; }; }, []);
  useEffect(() => { const off = window.hibiDesktop?.onLocalVoiceText?.((text) => setInput(text)); return () => off?.(); }, []);
  const toggleVoice = async () => { if (listening) { await window.hibiDesktop?.stopLocalVoice?.(); setListening(false); return; } setListening(true); const result = await window.hibiDesktop?.listenLocalVoice?.(); if (result?.status !== 'listening') setListening(false); };
  const send = () => { const message = input.trim(); if (!message || isRunning) return; conversations.record({ role: 'user', text: message, at: new Date().toISOString() }); setInput(''); void turn.ask(message); };
  return <div className="view">
    <div className="view-heading"><div><p className="eyebrow">TABY · LOCAL TOOLS</p><h1>Local assistant</h1><p className="muted">Ações usam ferramentas locais validadas e confirmações explícitas. O modo local não usa rede; um provedor configurado pode usar seu endpoint.</p></div></div>
    <TabyAtelierStatus title={activeConversation?.title} messageCount={messages.length} state={state} />
    <section className="settings-card" aria-label="Offline model status"><div className="setting-row"><div><strong>Offline brain</strong><span>{localModel.status === 'ready' ? `Modelo ${localModel.modelId} carregado localmente.` : localModel.error || 'Nenhum modelo offline instalado. O assistente local continua disponível.'}</span></div><b className={`pill ${localModel.status === 'ready' ? 'green' : 'amber'}`}>{localModel.status === 'ready' ? 'Ready' : 'Fallback'}</b></div></section>
    <section className="list-card" aria-label="Assistant capabilities"><div className="task-row"><span className="tag orange">status</span><div><strong>What I can access</strong><p className="muted">Only the local workspace data and controls listed here.</p></div></div>{LOCAL_CAPABILITIES.map((capability) => <div className="task-row" key={capability.id}><span className={`tag ${capability.status === 'available' ? 'green' : 'muted'}`}>{capability.status}</span><div><strong>{capability.label}</strong><p className="muted">{capability.description}</p></div></div>)}</section>
    <ConversationList conversations={conversations.conversations} activeId={conversations.activeId} query={conversations.query} onSelect={conversations.select} onSearch={conversations.search} onCreate={conversations.create} onDelete={conversations.remove} onDeleteAll={() => { if (window.confirm(t('taby.deleteAllConfirm'))) conversations.removeAll(); }} />
    {conversations.saveFailed && <WorkspaceState title={t('taby.saveFailed')} />}
    <section className="list-card" aria-live="polite"><div className="task-row"><span className="tag orange">assistant</span><div><span>{t('taby.greeting')}</span><small className="muted" style={{ display: 'block', marginTop: 4 }}>Hibi local tools · local-tool-provider</small></div></div>{messages.map((message, index) => <div className="task-row" key={`${message.role}-${index}`}><span className="tag orange">{message.role}</span><div><span>{message.text}</span>{message.provenance && <small className="muted" style={{ display: 'block', marginTop: 4 }}>{message.provenance}</small>}</div></div>)}{state.status === 'streaming' && <div className="task-row" role="status"><span className="tag orange">streaming</span><div><strong>{state.text || (state.cancelRequested ? 'Cancelando…' : 'Gerando resposta…')}</strong>{provenanceLabel(state.provenance) && <small className="muted" style={{ display: 'block', marginTop: 4 }}>{provenanceLabel(state.provenance)}</small>}</div></div>}{state.status === 'confirmation' && <div className="task-row" role="alert"><span className="tag amber">confirmation</span><div><strong>{state.text}</strong><div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button className="primary" onClick={() => void turn.confirm()}>Confirmar</button><button className="outline" onClick={() => void turn.cancelConfirmation()}>Cancelar</button></div></div></div>}{failure && <div className="task-row" role="alert"><span className="tag amber">provider</span><div><strong>{failure.title}</strong><p className="muted">{failure.detail}</p><div style={{ display: 'flex', gap: 8, marginTop: 10 }}>{failure.canRetry && <button className="outline" onClick={() => void turn.retry()}>Tentar novamente</button>}{failure.canUseLocalFallback && <button className="primary" onClick={() => void turn.useLocalFallback()}>Usar assistente local</button>}</div></div></div>}</section>
    <div className="quick-input"><input disabled={isRunning} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') send(); }} placeholder="Pergunte ou peça uma ação" aria-label="Pergunte ou peça uma ação" /><button className={listening ? 'outline' : 'primary'} disabled={isRunning} onClick={() => void toggleVoice()}>{listening ? 'Parar voz' : 'Falar'}</button><button className="primary" disabled={isRunning} onClick={send}>Send</button>{isRunning && <button className="outline" onClick={turn.stop}>Parar</button>}</div>
  </div>;
}

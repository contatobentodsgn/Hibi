import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Button, Card } from '@heroui/react';
import { AudioLines, Bot, Check, ChevronLeft, CircleStop, MessageCircle, Mic, Plus, Search, Send, Trash2 } from 'lucide-react';
import { LOCAL_CAPABILITIES } from '../../../domain/capabilities';
import type { StudyData } from '../../../domain/models';
import { provenanceLabel } from '../../../ai/assistant-turn';
import { failurePresentationFor } from '../../assistant-presentation';
import { AssistantAtelierStatus } from '../../AssistantAtelierStatus';
import type { AssistantTurnControls } from '../../useAssistantTurn';
import type { ConversationsController } from '../../useConversations';
import type { VoiceTurnControls } from '../../useVoiceTurn';
import { PixanoEmptyState } from '../components/PixanoEmptyState';
import { PixanoUiRoot } from '../components/PixanoUiRoot';
import { SectionHeader } from '../components/SectionHeader';
import { useT } from '../../../i18n/LocaleProvider';
import './assistant-screen.css';
import './assistant-history-overflow.css';

type Props = Readonly<{ data: StudyData; turn: AssistantTurnControls; conversations: ConversationsController; voice?: VoiceTurnControls }>;

export function AssistantScreen({ data, turn, conversations, voice }: Props) {
  const t = useT();
  const [input, setInput] = useState('');
  const [historyOpen, setHistoryOpen] = useState(true);
  const [speechDismissed, setSpeechDismissed] = useState(false);
  const { state } = turn;
  const listening = voice?.listening ?? false;
  const speaking = voice?.speaking ?? false;
  const active = conversations.conversations.find((conversation) => conversation.id === conversations.activeId);
  const messages = active?.messages ?? [];
  const visible = useMemo(() => conversations.conversations.filter((conversation) => conversation.title.toLocaleLowerCase().includes(conversations.query.toLocaleLowerCase())), [conversations.conversations, conversations.query]);
  const running = state.status === 'streaming';
  const failure = state.status === 'failure' ? failurePresentationFor(state.failure) : null;

  useEffect(() => { if (voice) setInput(voice.transcript); }, [voice?.transcript]);
  useEffect(() => { if (state.status === 'streaming') setSpeechDismissed(false); }, [state.status, state.status === 'streaming' ? state.requestId : '']);
  const send = () => {
    const text = input.trim();
    if (!text || running) return;
    conversations.record({ role: 'user', text, at: new Date().toISOString() });
    setInput('');
    voice?.clearTranscript();
    void turn.ask(text);
  };
  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); }
  };
  const toggleVoice = () => { if (!voice) return; if (listening) void voice.stop(); else { setSpeechDismissed(false); void voice.start(); } };

  return <PixanoUiRoot className="assistant-screen">
    <SectionHeader title={t('assistant.title')} subtitle="Seu espaço para pensar. Ferramentas locais e confirmações explícitas. O modo local não envia sua conversa para a rede." actions={<Button variant="secondary" onPress={conversations.create}><Plus size={17} aria-hidden="true" />Nova conversa</Button>} />
    <div className="assistant-screen__history-control"><Button variant="ghost" size="sm" aria-expanded={historyOpen} aria-controls="assistant-conversations" onPress={() => setHistoryOpen((open) => !open)}><ChevronLeft className={historyOpen ? undefined : 'assistant-screen__history-control-icon--closed'} size={16} aria-hidden="true" />{historyOpen ? 'Ocultar conversas' : 'Mostrar conversas'}</Button></div>
    <div className="assistant-screen__layout" data-history-open={historyOpen}>
      <aside id="assistant-conversations" hidden={!historyOpen} className="assistant-screen__history" role="region" aria-label="Conversas">
        <div className="assistant-screen__history-heading"><h2>Conversas</h2>{conversations.conversations.length > 0 && <Button variant="ghost" size="sm" onPress={() => { if (window.confirm('Apagar todas as conversas?')) conversations.removeAll(); }}>Apagar todas</Button>}</div>
        <label className="assistant-screen__search"><Search size={15} aria-hidden="true" /><span className="sr-only">Buscar nas conversas</span><input type="search" aria-label="Buscar nas conversas" value={conversations.query} onChange={(event) => conversations.search(event.target.value)} placeholder="Buscar nas conversas" /></label>
        <div className="assistant-screen__conversation-list">
          {!conversations.conversations.length && <p>Nenhuma conversa salva ainda.</p>}
          {conversations.conversations.length > 0 && !visible.length && <p>Nenhuma conversa encontrada.</p>}
          {visible.map((conversation) => <div key={conversation.id} className="assistant-screen__conversation-row" data-active={conversation.id === conversations.activeId}><button type="button" aria-current={conversation.id === conversations.activeId ? 'true' : undefined} onClick={() => conversations.select(conversation.id)}><MessageCircle size={15} aria-hidden="true" /><span>{conversation.title}</span></button><Button isIconOnly variant="ghost" aria-label={`Apagar: ${conversation.title}`} onPress={() => conversations.remove(conversation.id)}><Trash2 size={14} aria-hidden="true" /></Button></div>)}
        </div>
        <div className="assistant-screen__capabilities"><strong>O assistente pode acessar</strong>{LOCAL_CAPABILITIES.filter((capability) => capability.status === 'available').map((capability) => <span key={capability.id}><Check size={12} aria-hidden="true" />{capability.label}</span>)}<small>IA externa permanece indisponível no modo local.</small></div>
      </aside>

      <section className="assistant-screen__conversation" aria-label="Conversa do assistente">
        <AssistantAtelierStatus title={active?.title} messageCount={messages.length} state={state} />
        {conversations.saveFailed && <p className="assistant-screen__save-failure" role="alert">Não foi possível salvar a conversa neste Mac.</p>}
        <Card className="assistant-screen__messages" aria-live="polite">
          <div className="assistant-screen__assistant-intro"><span><Bot size={18} aria-hidden="true" /></span><div><strong>Assistente Pixano</strong><p>Pronto para organizar o que importa agora.</p></div></div>
          {messages.length ? <ol>{messages.map((message, index) => <li key={`${message.role}-${message.at}-${index}`} data-role={message.role}><span>{message.role === 'user' ? 'Você' : 'Assistente Pixano'}</span><p>{message.text}</p>{message.provenance && <small>{message.provenance}</small>}</li>)}</ol> : <PixanoEmptyState icon={MessageCircle} tone="lavender" title="Comece por uma pergunta." description="O assistente consulta apenas seu espaço local e pede confirmação antes de qualquer alteração." />}
          {running && <div className="assistant-screen__turn" role="status"><Bot size={16} aria-hidden="true" /><div><strong>{state.text || (state.cancelRequested ? 'Cancelando…' : 'Pensando…')}</strong>{provenanceLabel(state.provenance) && <small>{provenanceLabel(state.provenance)}</small>}</div></div>}
          {state.status === 'confirmation' && <div className="assistant-screen__turn assistant-screen__turn--confirmation" role="alert"><Bot size={16} aria-hidden="true" /><div><strong>{state.text}</strong><div><Button variant="primary" onPress={() => void turn.confirm()}>Confirmar</Button><Button variant="secondary" onPress={() => void turn.cancelConfirmation()}>Cancelar</Button></div></div></div>}
          {failure && <div className="assistant-screen__turn assistant-screen__turn--failure" role="alert"><div><strong>{failure.title}</strong><p>{failure.detail}</p><div>{failure.canRetry && <Button variant="secondary" onPress={() => void turn.retry()}>Tentar novamente</Button>}{failure.canUseLocalFallback && <Button variant="primary" onPress={() => void turn.useLocalFallback()}>Usar assistente local</Button>}</div></div></div>}
        </Card>
        <div className="assistant-screen__composer"><textarea disabled={running} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={onComposerKeyDown} placeholder="Pergunte ou peça uma ação" aria-label="Pergunte ou peça uma ação" rows={2} /><div className="assistant-screen__composer-controls">{voice && window.pixanoDesktop?.setVoiceSettings && <label className="assistant-screen__voice-mode"><span>{t('voice.sendMode.label')}</span><select aria-label={t('voice.sendMode.label')} value={voice.sendMode} onChange={(event) => void voice.setSendMode(event.target.value as 'pause' | 'manual')}><option value="pause">{t('voice.sendMode.pause')}</option><option value="manual">{t('voice.sendMode.manual')}</option></select></label>}{speaking && !speechDismissed && <Button variant="secondary" onPress={() => { setSpeechDismissed(true); void voice?.stopSpeaking(); }}><CircleStop size={16} aria-hidden="true" />{t('voice.stopSpeaking')}</Button>}{(!speaking || speechDismissed) && <Button variant={listening ? 'secondary' : 'ghost'} isDisabled={running} aria-label={listening ? 'Parar voz' : 'Falar'} aria-pressed={listening} onPress={toggleVoice}>{listening ? <CircleStop size={17} aria-hidden="true" /> : <Mic size={17} aria-hidden="true" />}{listening ? 'Parar voz' : 'Falar'}</Button>}{running && <Button variant="secondary" onPress={turn.stop}><CircleStop size={16} aria-hidden="true" />Parar</Button>}<Button variant="primary" isDisabled={running} aria-label={t('assistant.send')} onPress={send}><Send size={16} aria-hidden="true" />{t('assistant.send')}</Button></div></div>
        {(voice?.statusText || voice?.notice) && !(speaking && speechDismissed) && <p className="assistant-screen__voice-notice" role="status" aria-live="polite"><AudioLines size={15} aria-hidden="true" />{voice.statusText || voice.notice}</p>}
      </section>
    </div>
  </PixanoUiRoot>;
}

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Button, Card } from '@heroui/react';
import { AudioLines, Bot, Check, ChevronLeft, CircleStop, MessageCircle, Mic, Plus, Search, Send, Trash2 } from 'lucide-react';
import { LOCAL_CAPABILITIES } from '../../../domain/capabilities';
import type { StudyData } from '../../../domain/models';
import { provenanceLabel } from '../../../ai/assistant-turn';
import { failurePresentationFor } from '../../assistant-presentation';
import { TabyAtelierStatus } from '../../TabyAtelierStatus';
import type { AssistantTurnControls } from '../../useAssistantTurn';
import type { ConversationsController } from '../../useConversations';
import type { VoiceTurnControls } from '../../useVoiceTurn';
import { HibiEmptyState } from '../components/HibiEmptyState';
import { HibiUiRoot } from '../components/HibiUiRoot';
import { SectionHeader } from '../components/SectionHeader';
import { useT } from '../../../i18n/LocaleProvider';
import './taby-screen.css';
import './taby-history-overflow.css';

type Props = Readonly<{ data: StudyData; turn: AssistantTurnControls; conversations: ConversationsController; voice?: VoiceTurnControls }>;

export function TabyScreen({ data, turn, conversations, voice }: Props) {
  const t = useT();
  const [input, setInput] = useState('');
  const [historyOpen, setHistoryOpen] = useState(true);
  const { state } = turn;
  const listening = voice?.listening ?? false;
  const active = conversations.conversations.find((conversation) => conversation.id === conversations.activeId);
  const messages = active?.messages ?? [];
  const visible = useMemo(() => conversations.conversations.filter((conversation) => conversation.title.toLocaleLowerCase().includes(conversations.query.toLocaleLowerCase())), [conversations.conversations, conversations.query]);
  const running = state.status === 'streaming';
  const failure = state.status === 'failure' ? failurePresentationFor(state.failure) : null;

  useEffect(() => { if (voice) setInput(voice.transcript); }, [voice?.transcript]);
  const send = () => {
    const text = input.trim();
    if (!text || running) return;
    conversations.record({ role: 'user', text, at: new Date().toISOString() });
    setInput('');
    void turn.ask(text);
  };
  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); }
  };
  const toggleVoice = () => { if (!voice) return; if (listening) void voice.stop(); else void voice.start(); };

  return <HibiUiRoot className="taby-screen">
    <SectionHeader title={t('taby.title')} subtitle="Seu espaço para pensar. Ferramentas locais e confirmações explícitas. O modo local não envia sua conversa para a rede." actions={<Button variant="secondary" onPress={conversations.create}><Plus size={17} aria-hidden="true" />Nova conversa</Button>} />
    <div className="taby-screen__history-control"><Button variant="ghost" size="sm" aria-expanded={historyOpen} aria-controls="taby-conversations" onPress={() => setHistoryOpen((open) => !open)}><ChevronLeft className={historyOpen ? undefined : 'taby-screen__history-control-icon--closed'} size={16} aria-hidden="true" />{historyOpen ? 'Ocultar conversas' : 'Mostrar conversas'}</Button></div>
    <div className="taby-screen__layout" data-history-open={historyOpen}>
      <aside id="taby-conversations" hidden={!historyOpen} className="taby-screen__history" role="region" aria-label="Conversas">
        <div className="taby-screen__history-heading"><h2>Conversas</h2>{conversations.conversations.length > 0 && <Button variant="ghost" size="sm" onPress={() => { if (window.confirm('Apagar todas as conversas?')) conversations.removeAll(); }}>Apagar todas</Button>}</div>
        <label className="taby-screen__search"><Search size={15} aria-hidden="true" /><span className="sr-only">Buscar nas conversas</span><input type="search" aria-label="Buscar nas conversas" value={conversations.query} onChange={(event) => conversations.search(event.target.value)} placeholder="Buscar nas conversas" /></label>
        <div className="taby-screen__conversation-list">
          {!conversations.conversations.length && <p>Nenhuma conversa salva ainda.</p>}
          {conversations.conversations.length > 0 && !visible.length && <p>Nenhuma conversa encontrada.</p>}
          {visible.map((conversation) => <div key={conversation.id} className="taby-screen__conversation-row" data-active={conversation.id === conversations.activeId}><button type="button" aria-current={conversation.id === conversations.activeId ? 'true' : undefined} onClick={() => conversations.select(conversation.id)}><MessageCircle size={15} aria-hidden="true" /><span>{conversation.title}</span></button><Button isIconOnly variant="ghost" aria-label={`Apagar: ${conversation.title}`} onPress={() => conversations.remove(conversation.id)}><Trash2 size={14} aria-hidden="true" /></Button></div>)}
        </div>
        <div className="taby-screen__capabilities"><strong>O assistente pode acessar</strong>{LOCAL_CAPABILITIES.filter((capability) => capability.status === 'available').map((capability) => <span key={capability.id}><Check size={12} aria-hidden="true" />{capability.label}</span>)}<small>IA externa permanece indisponível no modo local.</small></div>
      </aside>

      <section className="taby-screen__conversation" aria-label="Conversa do assistente">
        <TabyAtelierStatus title={active?.title} messageCount={messages.length} state={state} />
        {conversations.saveFailed && <p className="taby-screen__save-failure" role="alert">Não foi possível salvar a conversa neste Mac.</p>}
        <Card className="taby-screen__messages" aria-live="polite">
          <div className="taby-screen__assistant-intro"><span><Bot size={18} aria-hidden="true" /></span><div><strong>Assistente Pixano</strong><p>Pronto para organizar o que importa agora.</p></div></div>
          {messages.length ? <ol>{messages.map((message, index) => <li key={`${message.role}-${message.at}-${index}`} data-role={message.role}><span>{message.role === 'user' ? 'Você' : 'Assistente Pixano'}</span><p>{message.text}</p>{message.provenance && <small>{message.provenance}</small>}</li>)}</ol> : <HibiEmptyState icon={MessageCircle} tone="lavender" title="Comece por uma pergunta." description="O assistente consulta apenas seu espaço local e pede confirmação antes de qualquer alteração." />}
          {running && <div className="taby-screen__turn" role="status"><Bot size={16} aria-hidden="true" /><div><strong>{state.text || (state.cancelRequested ? 'Cancelando…' : 'Pensando…')}</strong>{provenanceLabel(state.provenance) && <small>{provenanceLabel(state.provenance)}</small>}</div></div>}
          {state.status === 'confirmation' && <div className="taby-screen__turn taby-screen__turn--confirmation" role="alert"><Bot size={16} aria-hidden="true" /><div><strong>{state.text}</strong><div><Button variant="primary" onPress={() => void turn.confirm()}>Confirmar</Button><Button variant="secondary" onPress={() => void turn.cancelConfirmation()}>Cancelar</Button></div></div></div>}
          {failure && <div className="taby-screen__turn taby-screen__turn--failure" role="alert"><div><strong>{failure.title}</strong><p>{failure.detail}</p><div>{failure.canRetry && <Button variant="secondary" onPress={() => void turn.retry()}>Tentar novamente</Button>}{failure.canUseLocalFallback && <Button variant="primary" onPress={() => void turn.useLocalFallback()}>Usar assistente local</Button>}</div></div></div>}
        </Card>
        <div className="taby-screen__composer"><textarea disabled={running} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={onComposerKeyDown} placeholder="Pergunte ou peça uma ação" aria-label="Pergunte ou peça uma ação" rows={2} /><div><Button variant={listening ? 'secondary' : 'ghost'} isDisabled={running} aria-label={listening ? 'Parar voz' : 'Falar'} aria-pressed={listening} onPress={toggleVoice}>{listening ? <CircleStop size={17} aria-hidden="true" /> : <Mic size={17} aria-hidden="true" />}{listening ? 'Parar voz' : 'Falar'}</Button>{running && <Button variant="secondary" onPress={turn.stop}><CircleStop size={16} aria-hidden="true" />Parar</Button>}<Button variant="primary" isDisabled={running} aria-label={t('taby.send')} onPress={send}><Send size={16} aria-hidden="true" />{t('taby.send')}</Button></div></div>
        {voice?.notice && <p className="taby-screen__voice-notice" role="status"><AudioLines size={15} aria-hidden="true" />{voice.notice}</p>}
      </section>
    </div>
  </HibiUiRoot>;
}

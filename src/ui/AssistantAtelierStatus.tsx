import type { AssistantTurnState } from '../ai/assistant-turn';
import { provenanceLabel } from '../ai/assistant-turn';
import { useT } from '../i18n/LocaleProvider';
import './assistant-atelier.css';

const stateLabel = (state: AssistantTurnState, t: ReturnType<typeof useT>) => {
  if (state.status === 'streaming') return t(state.cancelRequested ? 'assistant.status.stopping' : 'assistant.status.responding');
  if (state.status === 'confirmation') return t('assistant.status.awaitingConfirmation');
  if (state.status === 'failure') return t('assistant.status.needsAttention');
  if (state.status === 'replied') return t('assistant.status.responseReady');
  if (state.status === 'executed') return t(state.partialFailure ? 'assistant.status.partlyCompleted' : 'assistant.status.completed');
  if (state.status === 'cancelled') return t('assistant.status.cancelled');
  return t('assistant.status.ready');
};

const provenanceFor = (state: AssistantTurnState, local: string) => ('provenance' in state ? provenanceLabel(state.provenance) : local);

export function AssistantAtelierStatus({ title, messageCount, state }: Readonly<{ title?: string; messageCount: number; state: AssistantTurnState }>) {
  const t = useT();
  return <section className="assistant-atelier-status" aria-label={t('assistant.status.aria')}>
    <div><span>{t('assistant.status.conversation')}</span><strong>{title ?? t('assistant.status.noConversation')}</strong></div>
    <div><span>{t('assistant.status.messages')}</span><strong>{messageCount}</strong></div>
    <div><span>{t('assistant.status.assistant')}</span><strong>{stateLabel(state, t)}</strong><small>{provenanceFor(state, t('assistant.status.local'))}</small></div>
  </section>;
}

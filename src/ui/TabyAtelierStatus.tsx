import type { AssistantTurnState } from '../ai/assistant-turn';
import { provenanceLabel } from '../ai/assistant-turn';
import { useT } from '../i18n/LocaleProvider';
import './taby-atelier.css';

const stateLabel = (state: AssistantTurnState, t: ReturnType<typeof useT>) => {
  if (state.status === 'streaming') return t(state.cancelRequested ? 'taby.status.stopping' : 'taby.status.responding');
  if (state.status === 'confirmation') return t('taby.status.awaitingConfirmation');
  if (state.status === 'failure') return t('taby.status.needsAttention');
  if (state.status === 'replied') return t('taby.status.responseReady');
  if (state.status === 'executed') return t(state.partialFailure ? 'taby.status.partlyCompleted' : 'taby.status.completed');
  if (state.status === 'cancelled') return t('taby.status.cancelled');
  return t('taby.status.ready');
};

const provenanceFor = (state: AssistantTurnState, local: string) => ('provenance' in state ? provenanceLabel(state.provenance) : local);

export function TabyAtelierStatus({ title, messageCount, state }: Readonly<{ title?: string; messageCount: number; state: AssistantTurnState }>) {
  const t = useT();
  return <section className="taby-atelier-status" aria-label={t('taby.status.aria')}>
    <div><span>{t('taby.status.conversation')}</span><strong>{title ?? t('taby.status.noConversation')}</strong></div>
    <div><span>{t('taby.status.messages')}</span><strong>{messageCount}</strong></div>
    <div><span>{t('taby.status.assistant')}</span><strong>{stateLabel(state, t)}</strong><small>{provenanceFor(state, t('taby.status.local'))}</small></div>
  </section>;
}

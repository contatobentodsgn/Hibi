import type { AssistantTurnState } from '../ai/assistant-turn';
import { provenanceLabel } from '../ai/assistant-turn';
import { useT } from '../i18n/LocaleProvider';
import './taby-atelier.css';

const stateLabel = (state: AssistantTurnState, ready: string) => {
  if (state.status === 'streaming') return state.cancelRequested ? 'Stopping response' : 'Responding now';
  if (state.status === 'confirmation') return 'Awaiting your confirmation';
  if (state.status === 'failure') return 'Needs attention';
  if (state.status === 'replied') return 'Response ready';
  if (state.status === 'executed') return state.partialFailure ? 'Action partly completed' : 'Action completed';
  if (state.status === 'cancelled') return 'Last request cancelled';
  return ready;
};

const provenanceFor = (state: AssistantTurnState, local: string) => ('provenance' in state ? provenanceLabel(state.provenance) : local);

export function TabyAtelierStatus({ title, messageCount, state }: Readonly<{ title?: string; messageCount: number; state: AssistantTurnState }>) {
  const t = useT();
  return <section className="taby-atelier-status" aria-label={t('taby.status.aria')}>
    <div><span>{t('taby.status.conversation')}</span><strong>{title ?? 'No conversation selected'}</strong></div>
    <div><span>{t('taby.status.messages')}</span><strong>{messageCount}</strong></div>
    <div><span>{t('taby.status.assistant')}</span><strong>{stateLabel(state, t('taby.status.ready'))}</strong><small>{provenanceFor(state, t('taby.status.local'))}</small></div>
  </section>;
}

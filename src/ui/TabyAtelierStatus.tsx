import type { AssistantTurnState } from '../ai/assistant-turn';
import { provenanceLabel } from '../ai/assistant-turn';
import './taby-atelier.css';

const stateLabel = (state: AssistantTurnState) => {
  if (state.status === 'streaming') return state.cancelRequested ? 'Stopping response' : 'Responding now';
  if (state.status === 'confirmation') return 'Awaiting your confirmation';
  if (state.status === 'failure') return 'Needs attention';
  if (state.status === 'replied') return 'Response ready';
  if (state.status === 'executed') return state.partialFailure ? 'Action partly completed' : 'Action completed';
  if (state.status === 'cancelled') return 'Last request cancelled';
  return 'Ready to help';
};

const provenanceFor = (state: AssistantTurnState) => ('provenance' in state ? provenanceLabel(state.provenance) : 'Local assistant');

export function TabyAtelierStatus({ title, messageCount, state }: Readonly<{ title?: string; messageCount: number; state: AssistantTurnState }>) {
  return <section className="taby-atelier-status" aria-label="Assistant conversation status">
    <div><span>Conversation</span><strong>{title ?? 'No conversation selected'}</strong></div>
    <div><span>Messages in this conversation</span><strong>{messageCount}</strong></div>
    <div><span>Assistant</span><strong>{stateLabel(state)}</strong><small>{provenanceFor(state)}</small></div>
  </section>;
}

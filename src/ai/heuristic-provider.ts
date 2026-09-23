import type { AiProvider, AiProviderProposal, AiProviderRequest } from './contracts';

export class HeuristicAiProvider implements AiProvider {
  readonly id = 'heuristic';
  readonly label = 'Pixano local heuristic';

  async generate(request: AiProviderRequest, signal: AbortSignal): Promise<AiProviderProposal> {
    if (signal.aborted) throw new DOMException('The AI turn was cancelled.', 'AbortError');
    const evidence = request.contextEvidence;
    const reply = evidence.length
      ? evidence.map((item) => `${item.label}${item.content ? ` — ${item.content}` : ''}`).join('\n')
      : 'I can help with your local tasks, schedule, notes, and reminders.';
    return { reply, toolCalls: [], notchPresentation: { kind: 'reply', title: 'Pixano', body: reply.slice(0, 240) }, providerMetadata: { model: 'local-heuristic' } };
  }
}

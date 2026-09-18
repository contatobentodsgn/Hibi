import { describe, expect, it, vi } from 'vitest';
import type { AiProvider, AiProviderRequest } from '../contracts';
import { OFFLINE_BRAIN_PROMPT_CHARS, OfflineBrainProvider, buildOfflineBrainPrompt, cleanOfflineBrainReply } from '../offline-brain-provider';
import { createLocalHibiRuntime, LocalToolProvider } from '../local-runtime';
import { LocalRepository } from '../../data/local-repository';
import { createSeedData } from '../../data/seed-data';

const request = (overrides: Partial<AiProviderRequest> = {}): AiProviderRequest => ({
  message: 'me dá uma dica para focar',
  locale: 'en-US',
  currentTime: '2026-09-17T12:00:00.000Z',
  surface: 'desktop',
  allowedTools: [],
  contextEvidence: [],
  recentTranscript: [],
  ...overrides,
});

const tools = (toolCalls: { name: string; arguments: Record<string, unknown> }[] = []): AiProvider => ({
  id: 'local-tools',
  label: 'Hibi local tools',
  generate: async () => ({ reply: 'Posso ajudar com tarefas.', toolCalls, notchPresentation: null, providerMetadata: { model: 'local-tool-provider' } }),
});

describe('offline brain provider', () => {
  it('answers conversational turns with the local model and names it in the provenance', async () => {
    const runLocalModel = vi.fn(async ({ requestId }: { requestId: string }) => ({ requestId, status: 'complete' as const, text: '<think>\n\n</think>\n\nFaça pausas curtas.' }));
    const proposal = await new OfflineBrainProvider({ runLocalModel }, tools()).generate(request(), new AbortController().signal);

    expect(proposal.reply).toBe('Faça pausas curtas.');
    expect(proposal.toolCalls).toEqual([]);
    expect(proposal.providerMetadata).toMatchObject({ providerId: 'offline-brain', provider: 'Hibi offline brain', model: 'qwen3-1.7b' });
    expect(runLocalModel.mock.calls[0]![0].requestId).toMatch(/^[A-Za-z0-9_-]{1,80}$/);
  });

  it('leaves recognised actions with the local tools and never wakes the model for them', async () => {
    const runLocalModel = vi.fn();
    const proposal = await new OfflineBrainProvider({ runLocalModel }, tools([{ name: 'task.create', arguments: { title: 'x' } }])).generate(request(), new AbortController().signal);

    expect(proposal.toolCalls).toHaveLength(1);
    expect(proposal.providerMetadata).toMatchObject({ providerId: 'local-tools', provider: 'Hibi local tools' });
    expect(runLocalModel).not.toHaveBeenCalled();
  });

  it('keeps the local tools reply when the model is not downloaded or answers nothing', async () => {
    for (const result of [{ status: 'unavailable' as const, text: '' }, { status: 'complete' as const, text: '<think>só pensei</think>  ' }]) {
      const provider = new OfflineBrainProvider({ runLocalModel: async ({ requestId }) => ({ requestId, ...result }) }, tools());
      const proposal = await provider.generate(request(), new AbortController().signal);
      expect(proposal.reply).toBe('Posso ajudar com tarefas.');
      expect(proposal.providerMetadata?.model).toBe('local-tool-provider');
    }
    const withoutBridge = await new OfflineBrainProvider({}, tools()).generate(request(), new AbortController().signal);
    expect(withoutBridge.reply).toBe('Posso ajudar com tarefas.');
  });

  it('cancels the running generation when the turn is aborted', async () => {
    const controller = new AbortController();
    let release: (value: { requestId: string; status: 'cancelled'; text: string }) => void = () => {};
    const cancelLocalModel = vi.fn(async () => true);
    const runLocalModel = vi.fn(({ requestId }: { requestId: string }) => new Promise<{ requestId: string; status: 'cancelled'; text: string }>((resolve) => { release = (value) => resolve({ ...value, requestId }); }));
    const pending = new OfflineBrainProvider({ runLocalModel, cancelLocalModel }, tools()).generate(request(), controller.signal);
    await vi.waitFor(() => expect(runLocalModel).toHaveBeenCalled());

    controller.abort();
    release({ requestId: '', status: 'cancelled', text: '' });

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancelLocalModel).toHaveBeenCalledWith(runLocalModel.mock.calls[0]![0].requestId);
  });

  it('fits long questions, context and transcripts inside the model prompt budget, keeping the newest lines', () => {
    const prompt = buildOfflineBrainPrompt(request({
      message: 'q'.repeat(20_000),
      contextEvidence: Array.from({ length: 40 }, (_, index) => ({ sourceId: `s${index}`, label: `Tarefa ${index}`, content: 'c'.repeat(500) })),
      recentTranscript: Array.from({ length: 40 }, (_, index) => ({ role: index % 2 ? 'assistant' as const : 'user' as const, content: `fala ${index} ${'t'.repeat(300)}` })),
    }));

    expect(prompt.length).toBeLessThanOrEqual(OFFLINE_BRAIN_PROMPT_CHARS);
    expect(prompt).toContain('fala 39');
    expect(prompt).not.toContain('fala 0 ');
    expect(prompt).toContain('Tarefa 39');
    expect(prompt.endsWith('/no_think')).toBe(true);
  });

  it('tells the model which language to answer in, since the UI does not pass it', () => {
    expect(buildOfflineBrainPrompt(request({ message: 'me dá uma dica curta para manter o foco à tarde' }))).toContain('Always reply in Brazilian Portuguese');
    expect(buildOfflineBrainPrompt(request({ message: 'e se eu estiver cansado?' }))).toContain('Always reply in Brazilian Portuguese');
    expect(buildOfflineBrainPrompt(request({ locale: 'pt-BR', message: 'ok' }))).toContain('Always reply in Brazilian Portuguese');
    expect(buildOfflineBrainPrompt(request({ message: 'what is a good way to plan my week?' }))).toContain('Always reply in English');
  });

  it('strips reasoning blocks, including one the model never closed', () => {
    expect(cleanOfflineBrainReply('<think>a</think>Oi <think>b</think>tudo bem')).toBe('Oi tudo bem');
    expect(cleanOfflineBrainReply('Resposta<think>cortado no meio')).toBe('Resposta');
  });

  it('runs through the local runtime with offline brain provenance', async () => {
    const repository = new LocalRepository(createSeedData());
    const brain = new OfflineBrainProvider({ runLocalModel: async ({ requestId }) => ({ requestId, status: 'complete', text: 'Respire fundo.' }) }, new LocalToolProvider(repository));
    const result = await createLocalHibiRuntime(repository, {}, brain).runTurn({ message: 'me dá uma dica para focar', surface: 'desktop' });

    expect(result.reply).toBe('Respire fundo.');
    expect(result.provider).toMatchObject({ id: 'offline-brain', label: 'Hibi offline brain', model: 'qwen3-1.7b' });
  });
});

// Memória insuficiente ou motor nativo ausente não podem terminar a pergunta em "Provider unavailable".
it('uma falha do modelo cai nas ferramentas locais em vez de quebrar a pergunta', async () => {
  const provider = new OfflineBrainProvider({ runLocalModel: async () => { throw new Error('sem memória'); } }, tools());

  const proposal = await provider.generate(request(), new AbortController().signal);

  expect(proposal.reply).toBe('Posso ajudar com tarefas.');
});

// Visto no app: "Marque uma reunião para mim amanhã às 15h00" → "Marquei uma reunião amanhã às 15h00",
// sem nenhum bloco criado.
describe('o cérebro offline não diz que fez o que não fez', () => {
  it('uma promessa de ação vira a verdade, com o jeito de pedir', async () => {
    for (const text of ['Não há reuniões marcadas para hoje. Marquei uma reunião amanhã às 15h00.', 'Claro, vou te lembrar às 15h.', 'Pronto, está agendada.', "Sure, I've scheduled it for 3pm."]) {
      const runLocalModel = vi.fn(async ({ requestId }: { requestId: string }) => ({ requestId, status: 'complete' as const, text }));
      const proposal = await new OfflineBrainProvider({ runLocalModel }, tools()).generate(request({ message: 'oi, tudo bem?' }), new AbortController().signal);
      expect(proposal.reply, text).toMatch(/^Não fiz nada ainda/);
      expect(proposal.toolCalls).toEqual([]);
    }
  });

  it('uma conversa comum passa intacta', async () => {
    const runLocalModel = vi.fn(async ({ requestId }: { requestId: string }) => ({ requestId, status: 'complete' as const, text: 'Você tem três reuniões marcadas para hoje.' }));
    const proposal = await new OfflineBrainProvider({ runLocalModel }, tools()).generate(request({ message: 'quantas reuniões tenho hoje?' }), new AbortController().signal);
    expect(proposal.reply).toBe('Você tem três reuniões marcadas para hoje.');
  });

  it('o prompt diz ao modelo que ele não age', () => {
    expect(buildOfflineBrainPrompt(request())).toMatch(/never say that you did or that you will/);
  });
});

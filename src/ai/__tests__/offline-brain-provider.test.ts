import { describe, expect, it, vi } from 'vitest';
import type { AiProvider, AiProviderRequest } from '../contracts';
import { OFFLINE_BRAIN_PROMPT_CHARS, OfflineBrainProvider, buildOfflineBrainPrompt, cleanOfflineBrainReply } from '../offline-brain-provider';
import { createLocalAssistantRuntime, LocalToolProvider } from '../local-runtime';
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
  label: 'Pixano local tools',
  generate: async () => ({ reply: 'Posso ajudar com tarefas.', toolCalls, notchPresentation: null, providerMetadata: { model: 'local-tool-provider' } }),
});

describe('offline brain provider', () => {
  it('answers conversational turns with the local model and names it in the provenance', async () => {
    const runLocalModel = vi.fn(async ({ requestId }: { requestId: string }) => ({ requestId, status: 'complete' as const, text: '<think>\n\n</think>\n\nFaça pausas curtas.' }));
    const proposal = await new OfflineBrainProvider({ runLocalModel }, tools()).generate(request(), new AbortController().signal);

    expect(proposal.reply).toBe('Faça pausas curtas.');
    expect(proposal.toolCalls).toEqual([]);
    expect(proposal.providerMetadata).toMatchObject({ providerId: 'offline-brain', provider: 'Pixano offline assistant', model: 'qwen3-1.7b' });
    expect(runLocalModel.mock.calls[0]![0].requestId).toMatch(/^[A-Za-z0-9_-]{1,80}$/);
  });

  it('leaves recognised actions with the local tools and never wakes the model for them', async () => {
    const runLocalModel = vi.fn();
    const proposal = await new OfflineBrainProvider({ runLocalModel }, tools([{ name: 'task.create', arguments: { title: 'x' } }])).generate(request(), new AbortController().signal);

    expect(proposal.toolCalls).toHaveLength(1);
    expect(proposal.providerMetadata).toMatchObject({ providerId: 'local-tools', provider: 'Pixano local tools' });
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
    const result = await createLocalAssistantRuntime(repository, {}, brain).runTurn({ message: 'me dá uma dica para focar', surface: 'desktop' });

    expect(result.reply).toBe('Respire fundo.');
    expect(result.provider).toMatchObject({ id: 'offline-brain', label: 'Pixano offline assistant', model: 'qwen3-1.7b' });
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

// Pedido do usuário: "ele precisa servir como assistente e executar o que eu peço por áudio". O que as
// frases fixas não reconhecem passa pelo modo intenção do modelo, e o código determinístico faz o resto.
describe('o cérebro offline entende pedidos que as frases fixas não entendem', () => {
  const repository = () => new LocalRepository({ ...createSeedData(), blocks: [] });
  const brain = (intentJson: string, chat = 'Conversa.') => {
    const calls: { mode?: string }[] = [];
    const runLocalModel = vi.fn(async ({ requestId, mode }: { requestId: string; mode?: string }) => { calls.push({ mode }); return { requestId, status: 'complete' as const, text: mode === 'intent' ? intentJson : chat }; });
    return { calls, runLocalModel };
  };
  const ask = async (message: string, intentJson: string) => {
    const { calls, runLocalModel } = brain(intentJson);
    const proposal = await new OfflineBrainProvider({ runLocalModel }, new LocalToolProvider(repository())).generate(request({ message, locale: 'pt-BR', currentTime: new Date(2026, 8, 18, 10, 0).toISOString() }), new AbortController().signal);
    return { calls, proposal };
  };

  it('"preciso falar com o contador sexta às 14h" vira a reunião, com o título do assunto', async () => {
    const { calls, proposal } = await ask('preciso falar com o contador sexta às 14h', '{"action":"meeting","title":"falar com o contador","day":"sexta","time":"14h","endTime":""}');
    expect(calls[0]).toEqual({ mode: 'intent' });
    expect(proposal.toolCalls).toEqual([{ name: 'meeting.create', arguments: { title: 'Falar com o contador', start: '2026-09-25T14:00:00', end: '2026-09-25T15:00:00' } }]);
    expect(proposal.reply).toMatch(/^Marcar "Falar com o contador" em 25\/09/);
  });

  it('um afazer vira tarefa, e um aviso com horário vira lembrete no dia dito', async () => {
    expect((await ask('bota aí pra eu comprar pão amanhã', '{"action":"task","title":"comprar pão","day":"amanhã","time":"","endTime":""}')).proposal.toolCalls).toEqual([{ name: 'task.create', arguments: { title: 'Comprar pão', durationMinutes: 60 } }]);
    expect((await ask('me avisa amanhã de tomar remédio às 8 da noite', '{"action":"reminder","title":"tomar remédio","day":"amanhã","time":"8 da noite","endTime":""}')).proposal.toolCalls).toEqual([{ name: 'reminder.create', arguments: { title: 'Tomar remédio', at: '2026-09-19T20:00:00' } }]);
  });

  it('o título fica só com o assunto, mesmo quando o modelo repete o dia nele', async () => {
    const { proposal } = await ask('tenho dentista na quinta às 10h', '{"action":"meeting","title":"tenho dentista na quinta","day":"quinta","time":"10h","endTime":""}');
    expect(proposal.toolCalls[0]).toMatchObject({ name: 'meeting.create', arguments: { title: 'Dentista', start: '2026-09-24T10:00:00' } });
  });

  it('uma reunião sem horário vira pergunta, e o modelo não conversa por cima dela', async () => {
    const { calls, proposal } = await ask('preciso marcar com a Ana amanhã', '{"action":"meeting","title":"com a Ana","day":"amanhã","time":"","endTime":""}');
    expect(proposal.toolCalls).toEqual([]);
    expect(proposal.reply).toMatch(/^Para que horário\?/);
    expect(calls).toHaveLength(1);
  });

  it('conversa nem consulta o modo intenção; "none" e JSON quebrado caem na conversa', async () => {
    const conversa = await ask('me conta uma curiosidade', '{"action":"meeting","title":"x","day":"","time":"9h","endTime":""}');
    expect(conversa.calls).toEqual([{ mode: undefined }]);
    expect(conversa.proposal.reply).toBe('Conversa.');
    for (const json of ['{"action":"none","title":"","day":"","time":"","endTime":""}', 'isto não é json', '{"action":"apagar-tudo","title":"x","day":"","time":"","endTime":""}']) {
      const { proposal } = await ask('quero ouvir uma piada amanhã', json);
      expect(proposal.toolCalls, json).toEqual([]);
      expect(proposal.reply, json).toBe('Conversa.');
    }
  });
});

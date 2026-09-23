import { describe, expect, it, vi } from 'vitest';
import { createLocalAssistantRuntime, LocalToolProvider, type MeetingCalendarBridge } from '../local-runtime';
import { parseEntityCommand } from '../entity-commands';
import { parseIntent } from '../offline-brain-provider';
import { LocalRepository } from '../../data/local-repository';

// 18/09/2026 é uma sexta-feira; o pedido é feito às 10h.
const agora = new Date('2026-09-18T10:00:00');
const dados = () => new LocalRepository({
  activity: [], telemetry: [], goals: [],
  blocks: [
    { id: 'b-cris', title: 'Reunião com a Cristiane', start: '2026-09-19T09:00:00', end: '2026-09-19T10:00:00', category: 'work', isHard: true },
    { id: 'b-almoco', title: 'Almoço', start: '2026-09-19T12:00:00', end: '2026-09-19T13:00:00', category: 'break', isHard: true },
  ],
  tasks: [
    { id: 't-cris', title: 'Reunião com a Cristiane', durationMinutes: 60, category: 'work', status: 'open', deadline: '2026-09-19T09:00:00' },
    { id: 't-k1', title: 'Kabrito Post 01', durationMinutes: 60, category: 'work', status: 'open', deadline: '2026-09-18T09:00:00' },
    { id: 't-k2', title: 'Kabrito Post 02', durationMinutes: 60, category: 'work', status: 'open', deadline: '2026-09-21T09:00:00' },
    { id: 't-m1', title: 'Marina Post 01', durationMinutes: 60, category: 'work', status: 'open' },
    { id: 't-m2', title: 'Marina Post 02', durationMinutes: 60, category: 'work', status: 'open' },
    { id: 't-contrato', title: 'Revisar contrato', durationMinutes: 60, category: 'work', status: 'open' },
  ],
  reminders: [{ id: 'r-banco', title: 'Ligar para o banco', category: 'important', status: 'open', schedule: { at: '2026-09-18T15:00:00' } }],
  habits: [{ id: 'h-academia', title: 'Academia', frequency: 'daily', targetPerWeek: 5, completedDates: [], status: 'open' }],
  notes: [{ id: 'n-ideias', title: 'Ideias', content: 'x', createdAt: '', updatedAt: '' }],
});

const assistant = (calendar?: MeetingCalendarBridge) => {
  const repository = dados();
  const runtime = createLocalAssistantRuntime(repository, calendar ? { calendar } : {});
  const pedir = (message: string) => runtime.runTurn({ message, surface: 'desktop', now: agora });
  const confirmar = async (message: string) => { const turno = await pedir(message); return runtime.confirm(turno.confirmation!); };
  return { repository, pedir, confirmar };
};

describe('mover e adiar', () => {
  // Visto no app: "adia minha reunião… para as quatro e meia" criava uma reunião nova às 04:30.
  it('adiar a reunião move o bloco e a tarefa gêmea, na mesma duração, sem criar outra', async () => {
    const { repository, pedir, confirmar } = assistant();
    const turno = await pedir('Adia minha reunião com a Cristiane para as 4h30');
    expect(turno.reply).toBe('Mover "Reunião com a Cristiane" de 19/09 09:00 para 19/09 às 16:30?');
    expect(turno.confirmation?.calls).toEqual([
      { name: 'block.update', arguments: { id: 'b-cris', start: '2026-09-19T16:30:00', end: '2026-09-19T17:30:00' } },
      { name: 'task.update', arguments: { id: 't-cris', deadline: '2026-09-19T16:30:00' } },
    ]);
    expect(repository.listBlocks().find((block) => block.id === 'b-cris')?.start).toBe('2026-09-19T09:00:00');

    await confirmar('Adia minha reunião com a Cristiane para as 4h30');
    expect(repository.listBlocks().find((block) => block.id === 'b-cris')).toMatchObject({ start: '2026-09-19T16:30:00', end: '2026-09-19T17:30:00' });
    expect(repository.getTask('t-cris')?.deadline).toBe('2026-09-19T16:30:00');
    expect(repository.listBlocks()).toHaveLength(2);
  });

  it('"bom dia" ouvido no lugar de "adia" também move', async () => {
    const { pedir } = assistant();
    expect((await pedir('Bom dia minha reunião com a Cristiane para as quatro e meia')).confirmation?.calls[0]).toMatchObject({ name: 'block.update', arguments: { start: '2026-09-19T16:30:00' } });
  });

  it('avisa quando o novo horário cai em outro compromisso', async () => {
    const { pedir } = assistant();
    const turno = await pedir('Move a reunião com a Cristiane para amanhã ao meio-dia');
    expect(turno.reply).toBe('Mover "Reunião com a Cristiane" de 19/09 09:00 para 19/09 às 12:00? Atenção: no novo horário já tem o compromisso "Almoço".');
  });

  it('só o dia dito mantém a hora; só a hora dita mantém o dia', async () => {
    const { pedir } = assistant();
    expect((await pedir('remarca a reunião com a Cristiane para segunda')).confirmation?.calls[0]).toMatchObject({ arguments: { start: '2026-09-21T09:00:00', end: '2026-09-21T10:00:00' } });
    expect((await pedir('passa o lembrete do banco para as 17h')).confirmation?.calls).toEqual([{ name: 'reminder.update', arguments: { id: 'r-banco', at: '2026-09-18T17:00:00' } }]);
    expect((await pedir('passa o lembrete do banco para amanhã')).confirmation?.calls).toEqual([{ name: 'reminder.update', arguments: { id: 'r-banco', at: '2026-09-19T15:00:00' } }]);
  });

  it('entre nomes parecidos, vence o que é de hoje', async () => {
    const { pedir } = assistant();
    expect((await pedir('Deixa a produção do post da Kabrito para amanhã às 10')).confirmation?.calls).toEqual([{ name: 'task.update', arguments: { id: 't-k1', deadline: '2026-09-19T10:00:00' } }]);
  });

  it('o calendário conectado recebe o novo horário de um bloco que está lá', async () => {
    const update = vi.fn(async () => 'Pessoal');
    const { confirmar } = assistant({ publish: async () => null, update });
    const resultado = await confirmar('Adia a reunião com a Cristiane para as 16h');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ id: 'b-cris', start: '2026-09-19T16:00:00' }));
    expect(resultado.toolResults[0]?.summary).toBe('Bloco atualizado: Reunião com a Cristiane, 19/09 às 16:00, também no calendário "Pessoal".');
  });

  it('sem destino, pergunta para quando', async () => {
    const { pedir } = assistant();
    const turno = await pedir('adia a reunião com a Cristiane');
    expect(turno.confirmation).toBeUndefined();
    expect(turno.reply).toMatch(/^Para quando\?/);
  });
});

describe('concluir', () => {
  it('"já fiz a academia" marca o hábito de hoje', async () => {
    const { repository, pedir, confirmar } = assistant();
    const turno = await pedir('Já fiz a academia hoje, pode marcar como concluída');
    expect(turno.reply).toBe('Marcar o hábito "Academia" como feito hoje?');
    await confirmar('Já fiz a academia hoje, pode marcar como concluída');
    expect(repository.getHabit('h-academia')?.completedDates).toEqual(['2026-09-18']);
  });

  it('terminar uma tarefa a conclui', async () => {
    const { repository, confirmar, pedir } = assistant();
    expect((await pedir('marca a tarefa revisar contrato como feita')).confirmation?.calls).toEqual([{ name: 'task.update', arguments: { id: 't-contrato', status: 'completed' } }]);
    await confirmar('Terminei o revisar contrato');
    expect(repository.getTask('t-contrato')?.status).toBe('completed');
  });
});

describe('apagar', () => {
  it('apagar uma reunião leva a tarefa gêmea junto, depois de confirmar', async () => {
    const { repository, pedir, confirmar } = assistant();
    const turno = await pedir('Apaga a reunião com a Cristiane');
    expect(turno.reply).toBe('Excluir "Reunião com a Cristiane" da agenda e das tarefas? Isso não pode ser desfeito.');
    expect(repository.listBlocks()).toHaveLength(2);
    await confirmar('Apaga a reunião com a Cristiane');
    expect(repository.listBlocks().map((block) => block.id)).toEqual(['b-almoco']);
    expect(repository.getTask('t-cris')).toBeUndefined();
  });

  it('a pergunta diz de onde sai', async () => {
    const { pedir } = assistant();
    expect((await pedir('apaga o lembrete do banco')).reply).toBe('Excluir "Ligar para o banco" dos lembretes? Isso não pode ser desfeito.');
    expect((await pedir('apaga a tarefa revisar contrato')).reply).toBe('Excluir "Revisar contrato" das tarefas? Isso não pode ser desfeito.');
  });

  it('com mais de um candidato, pergunta qual', async () => {
    const { pedir } = assistant();
    const turno = await pedir('apaga o post da Marina');
    expect(turno.confirmation).toBeUndefined();
    expect(turno.reply).toBe('Qual delas: "Marina Post 01" ou "Marina Post 02"?');
  });

  it('sem candidato, diz que não achou', async () => {
    const { pedir } = assistant();
    expect((await pedir('apaga o dentista')).reply).toBe('Não achei "o dentista" na agenda, nas tarefas nem nos lembretes.');
  });
});

describe('o assunto da conversa', () => {
  it('"deixa isso pra amanhã" fala do que acabou de ser criado', async () => {
    const { repository, pedir, confirmar } = assistant();
    await confirmar('Crie uma tarefa revisar roteiro');
    const criada = repository.listTasks().find((task) => task.title === 'revisar roteiro')!;
    expect((await pedir('deixa isso pra amanhã')).confirmation?.calls).toEqual([{ name: 'task.update', arguments: { id: criada.id, deadline: '2026-09-19T09:00:00' } }]);
  });

  it('depois de mexer em algo, "ela" é a mesma coisa', async () => {
    const { pedir } = assistant();
    await pedir('adia a reunião com a Cristiane para as 16h');
    expect((await pedir('apaga ela')).confirmation?.calls[0]).toEqual({ name: 'block.delete', arguments: { id: 'b-cris' } });
  });

  it('sem assunto, pergunta do que se fala', async () => {
    const { pedir } = assistant();
    expect((await pedir('deixa isso pra amanhã')).reply).toMatch(/^Sobre o que você está falando\?/);
  });
});

describe('frases que não são esses pedidos', () => {
  it('ficam de fora', () => {
    for (const frase of ['deixa eu ver', 'tira uma dúvida', 'fiz uma reunião ótima', 'marque uma reunião amanhã às 15h', 'crie uma tarefa revisar roteiro', 'passagem para São Paulo'])
      expect(parseEntityCommand(frase), frase).toBeNull();
  });
});

describe('pelo cérebro offline', () => {
  it('a intenção "move" vira a mesma proposta, e o modelo pode devolvê-la', async () => {
    expect(parseIntent('{"action":"move","title":"reunião com a Cristiane","day":"segunda","time":"10h","endTime":""}')).toMatchObject({ action: 'move' });
    const provider = new LocalToolProvider(dados());
    const request = { message: 'x', locale: 'pt-BR', currentTime: agora.toISOString(), surface: 'desktop' as const, allowedTools: [], contextEvidence: [], recentTranscript: [] };
    const proposta = provider.fromIntent({ action: 'move', title: 'reunião com a Cristiane', day: 'segunda', time: '10h', endTime: '' }, request);
    expect(proposta?.toolCalls[0]).toEqual({ name: 'block.update', arguments: { id: 'b-cris', start: '2026-09-21T10:00:00', end: '2026-09-21T11:00:00' } });
    expect(provider.fromIntent({ action: 'complete', title: 'relatório', day: '', time: '', endTime: '' }, request)?.reply).toBe('Não achei "relatório" na agenda, nas tarefas nem nos lembretes.');
  });

  it('o que o cérebro moveu vira o assunto da conversa', async () => {
    const provider = new LocalToolProvider(dados());
    const request = { message: 'apaga ela', locale: 'pt-BR', currentTime: agora.toISOString(), surface: 'desktop' as const, allowedTools: [], contextEvidence: [], recentTranscript: [] };
    provider.fromIntent({ action: 'move', title: 'reunião com a Cristiane', day: 'segunda', time: '10h', endTime: '' }, request);
    const proposta = await provider.generate(request, new AbortController().signal);
    expect(proposta.toolCalls[0]).toEqual({ name: 'block.delete', arguments: { id: 'b-cris' } });
  });
});

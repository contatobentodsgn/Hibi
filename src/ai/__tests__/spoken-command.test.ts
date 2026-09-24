import { describe, expect, it, vi } from 'vitest';
import { normalizeSpokenCommand, parseSpokenTime, takeSpokenDay } from '../spoken-command';
import { createLocalAssistantRuntime, LocalToolProvider } from '../local-runtime';
import { OfflineBrainProvider } from '../offline-brain-provider';
import { LocalRepository } from '../../data/local-repository';
import { createSeedData } from '../../data/seed-data';

describe('parseSpokenTime', () => {
  it('entende os horários como a ditação do macOS os escreve', () => {
    expect(parseSpokenTime('15:00')).toBe('15:00');
    expect(parseSpokenTime('15h')).toBe('15:00');
    expect(parseSpokenTime('15h30')).toBe('15:30');
    expect(parseSpokenTime('15 horas')).toBe('15:00');
    expect(parseSpokenTime('9h')).toBe('09:00');
  });

  it('entende a manhã, a tarde e a noite, com número ou por extenso', () => {
    expect(parseSpokenTime('3 da tarde')).toBe('15:00');
    expect(parseSpokenTime('três da tarde')).toBe('15:00');
    expect(parseSpokenTime('três e meia da tarde')).toBe('15:30');
    expect(parseSpokenTime('8 da manhã')).toBe('08:00');
    expect(parseSpokenTime('dez da noite')).toBe('22:00');
    expect(parseSpokenTime('meio-dia')).toBe('12:00');
    expect(parseSpokenTime('meia-noite')).toBe('00:00');
  });

  // Visto no app: "às 9h00 da manhã" virava "Não entendi o horário".
  it('o período do dia vale para qualquer forma da hora', () => {
    expect(parseSpokenTime('9h00 da manhã')).toBe('09:00');
    expect(parseSpokenTime('às 9h00 da manhã')).toBe('09:00');
    expect(parseSpokenTime('9:30 da noite')).toBe('21:30');
    expect(parseSpokenTime('9 horas da manhã')).toBe('09:00');
    expect(parseSpokenTime('3h15 da tarde')).toBe('15:15');
    expect(parseSpokenTime('nove e meia da manhã')).toBe('09:30');
    expect(parseSpokenTime('12 da noite')).toBe('00:00');
    expect(parseSpokenTime('12 da tarde')).toBe('12:00');
    expect(parseSpokenTime('9')).toBe('09:00');
  });

  // Criar um lembrete para a hora errada é pior do que perguntar.
  it('na dúvida devolve nada, em vez de adivinhar', () => {
    expect(parseSpokenTime('depois do almoço')).toBeNull();
    expect(parseSpokenTime('25h')).toBeNull();
    expect(parseSpokenTime('13 da tarde')).toBeNull();
  });
});

describe('normalizeSpokenCommand', () => {
  it('tira o chamamento e a pontuação que a ditação acrescenta', () => {
    expect(normalizeSpokenCommand('Assistant, crie uma tarefa revisar roteiro.')).toBe('crie uma tarefa revisar roteiro');
    expect(normalizeSpokenCommand('Ei Assistant crie uma nota ideias')).toBe('crie uma nota ideias');
    // A ditação costuma ouvir "Assistant" como outra palavra: o que importa é o verbo que vem depois.
    expect(normalizeSpokenCommand('Hebe, crie um lembrete beber água')).toBe('crie um lembrete beber água');
    expect(normalizeSpokenCommand('por favor, crie uma tarefa x')).toBe('crie uma tarefa x');
  });

  it('não mexe numa frase que não é comando', () => {
    expect(normalizeSpokenCommand('Hibi Study é um app')).toBe('Hibi Study é um app');
    expect(normalizeSpokenCommand('Assistant, qual a minha agenda hoje?')).toBe('Assistant, qual a minha agenda hoje');
  });
});

describe('takeSpokenDay', () => {
  // 18/09/2026 é uma sexta-feira.
  const hoje = '2026-09-18';
  it('dias da semana apontam para o próximo, nunca para hoje', () => {
    expect(takeSpokenDay('na segunda às 9h', hoje)).toEqual({ days: 3, rest: 'às 9h' });
    expect(takeSpokenDay('sexta-feira', hoje).days).toBe(7);
    expect(takeSpokenDay('próxima quarta', hoje).days).toBe(5);
  });
  it('datas: "dia 25" deste mês ou do próximo, "25/09" e "dia 2 de outubro"', () => {
    expect(takeSpokenDay('dia 25', hoje).days).toBe(7);
    expect(takeSpokenDay('dia 5', hoje).days).toBe(17);
    expect(takeSpokenDay('25/09', hoje).days).toBe(7);
    expect(takeSpokenDay('dia 2 de outubro', hoje).days).toBe(14);
    expect(takeSpokenDay('dia 31 de fevereiro', hoje).days).toBeNull();
  });
});

describe('comandos ditados no Assistant', () => {
  const pedir = async (message: string) => {
    // Agenda vazia: os comandos são o assunto aqui, não os horários que a seed já ocupa.
    const runtime = createLocalAssistantRuntime(new LocalRepository({ ...createSeedData(), blocks: [] }));
    return runtime.runTurn({ message, surface: 'desktop', now: new Date('2026-09-18T10:00:00') });
  };
  const chamada = async (message: string) => (await pedir(message)).confirmation?.calls[0];

  it('"às 15h" cria o lembrete às 15h, e não agora com o horário no título', async () => {
    expect(await chamada('Crie um lembrete tomar água às 15h.')).toMatchObject({ name: 'reminder.create', arguments: { title: 'tomar água', at: '2026-09-18T15:00:00' } });
    expect(await chamada('Crie um lembrete tomar água às três da tarde')).toMatchObject({ arguments: { title: 'tomar água', at: '2026-09-18T15:00:00' } });
  });

  it('um horário que não dá para entender vira pergunta, nunca lembrete para agora', async () => {
    const resultado = await pedir('Crie um lembrete tomar água às depois do almoço');

    expect(resultado.confirmation).toBeUndefined();
    expect(resultado.reply).toMatch(/Não entendi o horário "depois do almoço"/);
  });

  it('o bloco aceita os horários ditos', async () => {
    expect(await chamada('Crie um bloco estudar das 14h às 15h')).toMatchObject({ name: 'block.create', arguments: { title: 'estudar', start: '2026-09-18T14:00:00', end: '2026-09-18T15:00:00' } });
  });

  it('chamar o Assistant pelo nome cria a tarefa, em vez de listar as que existem', async () => {
    expect(await chamada('Assistant, crie uma tarefa revisar roteiro.')).toMatchObject({ name: 'task.create', arguments: { title: 'revisar roteiro' } });
  });

  it('o ponto final da ditação não vai para o título', async () => {
    expect(await chamada('Crie uma tarefa revisar roteiro.')).toMatchObject({ arguments: { title: 'revisar roteiro' } });
  });

  // Visto no app instalado: "me lembra de…" ia para a conversa, e o cérebro offline respondia "claro,
  // vou ligar para o banco às 15h" sem criar lembrete nenhum.
  it('"me lembra de…" e as outras formas faladas criam o lembrete', async () => {
    const esperado = { name: 'reminder.create', arguments: { title: 'ligar para o banco', at: '2026-09-18T15:00:00' } };
    expect(await chamada('Assistant, me lembra de ligar para o banco às 15h.')).toMatchObject(esperado);
    expect(await chamada('Me lembre de ligar para o banco às 3 da tarde')).toMatchObject(esperado);
    expect(await chamada('Lembre-me de ligar para o banco às 15h')).toMatchObject(esperado);
    expect(await chamada('Hebe, lembrar de ligar para o banco às 15h')).toMatchObject(esperado);
  });

  it('"me lembra" com horário que não dá para entender vira pergunta', async () => {
    const resultado = await pedir('me lembra de ligar para o banco às depois do almoço');
    expect(resultado.confirmation).toBeUndefined();
    expect(resultado.reply).toMatch(/Não entendi o horário/);
  });

  it('"lembretes de hoje" continua sendo uma consulta, não um lembrete novo', async () => {
    expect(normalizeSpokenCommand('Assistant, lembretes de hoje')).not.toMatch(/^crie/);
    expect(await chamada('Assistant, lembretes de hoje')).toBeUndefined();
  });

  it('o foco começa no imperativo também', async () => {
    for (const frase of ['Inicie o foco', 'Assistant, começa um foco.', 'inicia uma sessão de foco', 'comece o foco agora'])
      expect(await chamada(frase), frase).toMatchObject({ name: 'focus.start' });
  });

  // Visto no app: estes pedidos iam para o cérebro offline, que dizia "marquei" sem marcar nada.
  it('marcar uma reunião vira uma reunião (agenda, tarefas e calendário), no dia dito, com uma hora de duração', async () => {
    expect(await chamada('Marque uma reunião para mim amanhã às 15h00')).toMatchObject({ name: 'meeting.create', arguments: { title: 'Reunião', start: '2026-09-19T15:00:00', end: '2026-09-19T16:00:00' } });
    expect(await chamada('Assistant, agende uma reunião com a Ana hoje às 3 da tarde.')).toMatchObject({ arguments: { title: 'Reunião com a Ana', start: '2026-09-18T15:00:00', end: '2026-09-18T16:00:00' } });
    expect(await chamada('marque um compromisso depois de amanhã das 14h às 16h30')).toMatchObject({ arguments: { title: 'Compromisso', start: '2026-09-20T14:00:00', end: '2026-09-20T16:30:00' } });
  });

  it('a frase do app: "amanhã às 9h00 da manhã" vira a reunião das 9 às 10', async () => {
    expect(await chamada('marque uma reunião amanhã às 9h00 da manhã')).toMatchObject({ arguments: { start: '2026-09-19T09:00:00', end: '2026-09-19T10:00:00' } });
    expect(await chamada('agende uma reunião com o João na segunda às 10h')).toMatchObject({ arguments: { title: 'Reunião com o João', start: '2026-09-21T10:00:00' } });
  });

  it('marcar sem horário, ou com um horário que não dá para entender, vira pergunta', async () => {
    const semHorario = await pedir('marque uma reunião amanhã');
    expect(semHorario.confirmation).toBeUndefined();
    expect(semHorario.reply).toMatch(/^Para que horário\?/);
    const confuso = await pedir('agende uma reunião amanhã às 3 e pouco');
    expect(confuso.confirmation).toBeUndefined();
    expect(confuso.reply).toMatch(/Não entendi o horário "3 e pouco"/);
  });

  // Pedido do usuário: a reunião não atrapalha a demanda da Kabrito, que é produção de post.
  it('uma reunião sobre uma demanda é marcada, e a pergunta conta o que já está no horário', async () => {
    const repository = new LocalRepository({ ...createSeedData(), blocks: [] });
    repository.createBlock({ title: 'Kabrito Post 05', start: '2026-09-19T15:00:00', end: '2026-09-19T16:00:00', category: 'work' });
    const resultado = await createLocalAssistantRuntime(repository).runTurn({ message: 'Marque uma reunião para mim amanhã às 15h', surface: 'desktop', now: new Date('2026-09-18T10:00:00') });
    expect(resultado.confirmation?.calls[0]).toMatchObject({ name: 'meeting.create' });
    expect(resultado.reply).toBe('No mesmo horário: "Kabrito Post 05". Marcar "Reunião" em 19/09, das 15:00 às 16:00, na agenda, nas tarefas e no calendário conectado?');
  });

  it('sobre outro compromisso, a pergunta avisa em destaque, e confirmar marca mesmo assim', async () => {
    const repository = new LocalRepository({ ...createSeedData(), blocks: [] });
    repository.createBlock({ title: 'Almoço', start: '2026-09-19T12:00:00', end: '2026-09-19T14:00:00', category: 'break', isHard: true });
    const runtime = createLocalAssistantRuntime(repository);
    const resultado = await runtime.runTurn({ message: 'Marque uma reunião amanhã ao meio-dia', surface: 'desktop', now: new Date('2026-09-18T10:00:00') });
    expect(resultado.reply).toMatch(/^Atenção: no mesmo horário já tem o compromisso "Almoço"\. Marcar/);
    await runtime.confirm(resultado.confirmation!);
    expect(repository.listBlocks().find((block) => block.title === 'Reunião')).toMatchObject({ isHard: true, start: '2026-09-19T12:00:00' });
  });

  it('"amanhã" no lembrete vai para a data, e não para o título', async () => {
    expect(await chamada('me lembra de ligar para o banco amanhã às 15h')).toMatchObject({ name: 'reminder.create', arguments: { title: 'ligar para o banco', at: '2026-09-19T15:00:00' } });
    expect(await chamada('me lembra de ligar para o banco às 15h de amanhã')).toMatchObject({ arguments: { title: 'ligar para o banco', at: '2026-09-19T15:00:00' } });
  });

  it('as frases escritas continuam funcionando como antes', async () => {
    expect(await chamada('crie uma tarefa: revisar roteiro')).toMatchObject({ name: 'task.create', arguments: { title: 'revisar roteiro' } });
    expect(await chamada('crie um lembrete tomar água às 15:00')).toMatchObject({ arguments: { at: '2026-09-18T15:00:00' } });
    expect(await chamada('crie um bloco estudar das 14:00 às 15:00')).toMatchObject({ arguments: { start: '2026-09-18T14:00:00' } });
  });
});

// Com o cérebro offline instalado, toda frase que não vira ação vai para o modelo. A pergunta de
// volta sobre o horário não pode ser trocada por uma conversa.
it('o cérebro offline não responde por cima da pergunta sobre o horário', async () => {
  const repository = new LocalRepository(createSeedData());
  let chamadas = 0;
  const brain = new OfflineBrainProvider({ runLocalModel: async ({ requestId }) => { chamadas += 1; return { requestId, status: 'complete', text: 'Beba água!' }; } }, new LocalToolProvider(repository));

  const resultado = await createLocalAssistantRuntime(repository, {}, brain).runTurn({ message: 'Crie um lembrete tomar água às depois do almoço', surface: 'desktop', now: new Date('2026-09-18T10:00:00') });

  expect(resultado.reply).toMatch(/Não entendi o horário/);
  expect(chamadas).toBe(0);
});

// Pedido do usuário: "o correto era isso ir para minhas tarefas do dia de amanhã e ir para os calendários".
describe('uma reunião confirmada vai para a agenda, as tarefas e o calendário', () => {
  const marcar = async (calendar?: { publish: (block: { id: string; title: string }) => Promise<string | null> }, blocks: unknown[] = []) => {
    const repository = new LocalRepository({ ...createSeedData(), blocks: blocks as never });
    const runtime = createLocalAssistantRuntime(repository, calendar ? { calendar } : {});
    const turno = await runtime.runTurn({ message: 'Marque uma reunião com a Ana amanhã às 9h00 da manhã', surface: 'desktop', now: new Date('2026-09-18T10:00:00') });
    return { repository, turno, confirmar: () => runtime.confirm(turno.confirmation!) };
  };

  it('a pergunta descreve a reunião, e nada é criado antes de confirmar', async () => {
    const publish = vi.fn(async () => 'Pessoal');
    const { repository, turno } = await marcar({ publish });
    expect(turno.reply).toBe('Marcar "Reunião com a Ana" em 19/09, das 09:00 às 10:00, na agenda, nas tarefas e no calendário conectado?');
    expect(repository.listBlocks().some((block) => block.title === 'Reunião com a Ana')).toBe(false);
    expect(publish).not.toHaveBeenCalled();
  });

  it('confirmada, cria o bloco, a tarefa com prazo no horário e o evento no calendário', async () => {
    const publish = vi.fn(async () => 'Pessoal');
    const { repository, confirmar } = await marcar({ publish });
    const feito = await confirmar();
    const bloco = repository.listBlocks().find((block) => block.title === 'Reunião com a Ana');
    expect(bloco).toMatchObject({ start: '2026-09-19T09:00:00', end: '2026-09-19T10:00:00' });
    expect(repository.listTasks().find((task) => task.title === 'Reunião com a Ana')).toMatchObject({ deadline: '2026-09-19T09:00:00', durationMinutes: 60, status: 'open' });
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ id: bloco!.id }));
    expect(feito.toolResults.map((item) => (item as { summary?: string }).summary).join(" ")).toMatch(/no calendário "Pessoal"/);
  });

  it('sem calendário bidirecional, cria na agenda e nas tarefas e diz como ligar o calendário', async () => {
    const { repository, confirmar } = await marcar({ publish: async () => null });
    const feito = await confirmar();
    expect(repository.listTasks().some((task) => task.title === 'Reunião com a Ana')).toBe(true);
    expect(feito.toolResults.map((item) => (item as { summary?: string }).summary).join(" ")).toMatch(/escolha um calendário bidirecional em Ajustes › Integrations/);
  });

  it('se o calendário recusar, a reunião continua na agenda e nas tarefas, e o aviso diz isso', async () => {
    const { repository, confirmar } = await marcar({ publish: async () => { throw new Error('offline'); } });
    const feito = await confirmar();
    expect(repository.listBlocks().some((block) => block.title === 'Reunião com a Ana')).toBe(true);
    expect(feito.toolResults.map((item) => (item as { summary?: string }).summary).join(" ")).toMatch(/o calendário recusou o evento/);
  });
});

import { describe, expect, it } from 'vitest';
import { normalizeSpokenCommand, parseSpokenTime } from '../spoken-command';
import { createLocalHibiRuntime, LocalToolProvider } from '../local-runtime';
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

  // Criar um lembrete para a hora errada é pior do que perguntar.
  it('na dúvida devolve nada, em vez de adivinhar', () => {
    expect(parseSpokenTime('depois do almoço')).toBeNull();
    expect(parseSpokenTime('25h')).toBeNull();
    expect(parseSpokenTime('13 da tarde')).toBeNull();
  });
});

describe('normalizeSpokenCommand', () => {
  it('tira o chamamento e a pontuação que a ditação acrescenta', () => {
    expect(normalizeSpokenCommand('Taby, crie uma tarefa revisar roteiro.')).toBe('crie uma tarefa revisar roteiro');
    expect(normalizeSpokenCommand('Ei Taby crie uma nota ideias')).toBe('crie uma nota ideias');
    // A ditação costuma ouvir "Taby" como outra palavra: o que importa é o verbo que vem depois.
    expect(normalizeSpokenCommand('Hebe, crie um lembrete beber água')).toBe('crie um lembrete beber água');
    expect(normalizeSpokenCommand('por favor, crie uma tarefa x')).toBe('crie uma tarefa x');
  });

  it('não mexe numa frase que não é comando', () => {
    expect(normalizeSpokenCommand('Hibi Study é um app')).toBe('Hibi Study é um app');
    expect(normalizeSpokenCommand('Taby, qual a minha agenda hoje?')).toBe('Taby, qual a minha agenda hoje');
  });
});

describe('comandos ditados no Taby', () => {
  const pedir = async (message: string) => {
    const runtime = createLocalHibiRuntime(new LocalRepository(createSeedData()));
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

  it('chamar o Taby pelo nome cria a tarefa, em vez de listar as que existem', async () => {
    expect(await chamada('Taby, crie uma tarefa revisar roteiro.')).toMatchObject({ name: 'task.create', arguments: { title: 'revisar roteiro' } });
  });

  it('o ponto final da ditação não vai para o título', async () => {
    expect(await chamada('Crie uma tarefa revisar roteiro.')).toMatchObject({ arguments: { title: 'revisar roteiro' } });
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

  const resultado = await createLocalHibiRuntime(repository, {}, brain).runTurn({ message: 'Crie um lembrete tomar água às depois do almoço', surface: 'desktop', now: new Date('2026-09-18T10:00:00') });

  expect(resultado.reply).toMatch(/Não entendi o horário/);
  expect(chamadas).toBe(0);
});

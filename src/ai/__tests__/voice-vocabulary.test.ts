import { describe, expect, it } from 'vitest';
import { voiceVocabulary } from '../voice-vocabulary';
import type { StudyData } from '../../domain/models';

type Data = Pick<StudyData, 'tasks' | 'notes' | 'reminders' | 'habits' | 'goals' | 'blocks'>;
const empty: Data = { tasks: [], notes: [], reminders: [], habits: [], goals: [], blocks: [] };
const task = (title: string, folder?: string) => ({ id: title, title, durationMinutes: 30, category: 'work' as const, ...(folder ? { folder } : {}) });
const block = (title: string) => ({ id: title, title, start: '2026-09-18T09:00', end: '2026-09-18T10:00', category: 'work' as const });

describe('voiceVocabulary', () => {
  it('traz os nomes de pasta, os nomes próprios e as siglas do que já está no Hibi', () => {
    const terms = voiceVocabulary({
      ...empty,
      tasks: [task('Produzir carrossel', 'Kabrito OS'), task('Revisar proposta da Cristiane')],
      reminders: [{ id: 'r', title: 'Pagar o DAS', category: 'important', schedule: { at: '2026-09-20T09:00' } }],
    });

    expect(terms).toEqual(expect.arrayContaining(['Kabrito OS', 'Kabrito', 'OS', 'Cristiane', 'DAS']));
  });

  it('não trata a primeira palavra comum de um título como nome', () => {
    const terms = voiceVocabulary({ ...empty, tasks: [task('Ligar para o banco agora mesmo'), task('Reunião com a Kabrito sobre o post')] });

    expect(terms).toContain('Kabrito');
    expect(terms).not.toContain('Ligar');
    expect(terms).not.toContain('Reunião');
  });

  it('usa o título curto inteiro, mas não o longo', () => {
    const terms = voiceVocabulary({ ...empty, blocks: [block('Kabrito Post 01'), block('Ir ao banco com a mãe')] });

    expect(terms).toContain('Kabrito Post 01');
    expect(terms).toContain('Kabrito');
    expect(terms).not.toContain('Ir ao banco com a mãe');
  });

  it('nunca usa o conteúdo das notas nem a descrição das tarefas', () => {
    const terms = voiceVocabulary({
      ...empty,
      notes: [{ id: 'n', title: 'Ideias', content: 'Senha do Banco Secreto', createdAt: '', updatedAt: '' }],
      tasks: [{ ...task('Revisar'), description: 'Contrato com a Acme Sigilosa' }],
    });

    expect(terms.join(' ')).not.toMatch(/Secreto|Banco|Acme|Sigilosa/);
  });

  it('o que se repete vem primeiro, sem duplicar, e a lista respeita o teto', () => {
    const tasks = Array.from({ length: 150 }, (_, index) => task(`Tarefa ${index}`));
    const terms = voiceVocabulary({ ...empty, tasks: [...tasks, task('Tarefa 7'), task('tarefa 7')] }, 100);

    expect(terms).toHaveLength(100);
    expect(terms[0]).toBe('Tarefa 7');
    expect(terms.filter((term) => term.toLowerCase() === 'tarefa 7')).toHaveLength(1);
  });

  it('pasta pesa mais que um título que se repete', () => {
    const terms = voiceVocabulary({ ...empty, tasks: [task('Almoço'), task('Almoço'), task('Almoço'), task('Post', 'Hibi')] });

    expect(terms[0]).toBe('Hibi');
  });
});

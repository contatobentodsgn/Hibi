import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { StudyData } from '../../domain/models';
import { LocaleProvider } from '../../i18n/LocaleProvider';
import { AgendaScreen } from '../redesign/screens/AgendaScreen';
import { GoalsScreen } from '../redesign/screens/GoalsScreen';
import { HabitsScreen } from '../redesign/screens/HabitsScreen';
import { NotesScreen } from '../redesign/screens/NotesScreen';

const noop = () => undefined;
const base: StudyData = { activity: [], tasks: [], notes: [], reminders: [], habits: [], goals: [], blocks: [], telemetry: [] };
const render = (node: React.ReactNode) => renderToStaticMarkup(<LocaleProvider initialLanguage="pt">{node}</LocaleProvider>);

describe('orientação contextual por estado', () => {
  it('sugere uma pausa apenas quando a visão da Agenda tem compromissos e nenhuma pausa', () => {
    const withWork = { ...base, blocks: [{ id: 'work', title: 'Projeto', start: '2026-09-24T10:00:00', end: '2026-09-24T11:00:00', category: 'work' as const }] };
    const props = { mode: 'day' as const, date: '2026-09-24', onModeChange: noop, onDateChange: noop, onCreateBlock: noop, onDeleteBlock: noop, onEvent: noop };
    expect(render(<AgendaScreen data={withWork} {...props} />)).toContain('data-contextual-guidance="agenda.plan-break"');
    expect(render(<AgendaScreen data={{ ...withWork, blocks: [...withWork.blocks, { id: 'break', title: 'Pausa', start: '2026-09-24T12:00:00', end: '2026-09-24T13:00:00', category: 'break' }] }} {...props} />)).not.toContain('data-contextual-guidance="agenda.plan-break"');
  });

  it('aponta para a nota mais recente e apresenta ações diretas nos estados vazios de ritmo', () => {
    const notes = [{ id: 'n1', title: 'Mais recente', content: '', folder: 'Bento', createdAt: '2026-09-23', updatedAt: '2026-09-24' }];
    expect(render(<NotesScreen data={{ ...base, notes }} onCreate={noop} onUpdate={noop} onDelete={noop} />)).toContain('data-contextual-guidance="notes.resume"');
    expect(render(<HabitsScreen data={base} onCreate={noop} onToggleCompletion={noop} onUpdate={noop} onDelete={noop} now={new Date(2026, 8, 24)} />)).toContain('Nenhum hábito ainda');
    expect(render(<HabitsScreen data={base} onCreate={noop} onToggleCompletion={noop} onUpdate={noop} onDelete={noop} now={new Date(2026, 8, 24)} />)).toContain('Criar hábito');
    expect(render(<GoalsScreen data={base} onCreate={noop} onProgress={noop} onUpdate={noop} onDelete={noop} />)).toContain('Escolha uma meta para começar');
  });

  it('só sugere marcar hábitos semanais que ainda não foram concluídos hoje e identifica o hábito', () => {
    const today = '2026-09-24';
    const habit = { id: 'weekly-read', title: 'Ler', frequency: 'weekly' as const, targetPerWeek: 3, completedDates: [today] };
    const props = { onCreate: noop, onToggleCompletion: noop, onUpdate: noop, onDelete: noop, now: new Date(2026, 8, 24) };

    expect(render(<HabitsScreen data={{ ...base, habits: [habit] }} {...props} />)).not.toContain('data-contextual-guidance="habits.check-next"');
    expect(render(<HabitsScreen data={{ ...base, habits: [{ ...habit, completedDates: [] }] }} {...props} />)).toContain('Ainda há um hábito de hoje sem marcar: Ler.');
  });
});

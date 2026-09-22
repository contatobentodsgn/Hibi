import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { StudyData } from '../../domain/models';
import { ReviewView } from '../ReviewView';

const data: StudyData = {
  activity: [],
  notes: [],
  reminders: [],
  habits: [],
  goals: [],
  telemetry: [],
  blocks: [],
  tasks: [
    { id: 'copy-a', title: 'Post cafe', folder: 'Bento', category: 'work', durationMinutes: 60, status: 'open', deadline: '2026-09-14T10:00' },
    { id: 'copy-b', title: 'Post Café', folder: 'Bento', category: 'work', durationMinutes: 60, status: 'open', deadline: '2026-09-14T10:00' },
    { id: 'urgent', title: 'Enviar proposta', category: 'work', durationMinutes: 45, status: 'open', deadline: '2026-09-14T11:00' },
  ],
};

describe('ReviewView', () => {
  it('renders explainable review suggestions and accessible batch dismissal controls', () => {
    const markup = renderToStaticMarkup(<ReviewView data={data} now={new Date(2026, 8, 12, 12)} onNavigate={() => undefined} />);

    expect(markup).toContain('aria-label="Sugestões"');
    expect(markup).toContain('Blocos agendados possivelmente duplicados');
    expect(markup).toContain('Tarefas abertas sem agenda');
    expect(markup).toContain('same title');
    expect(markup).toContain('45 min');
    expect(markup).toContain('Dispensar todas as sugestões duplicadas');
    expect(markup).toContain('Dispensar todas as sugestões sem agenda');
    expect(markup).toContain('aria-label="Dispensar blocos agendados possivelmente duplicados · 2"');
  });
});

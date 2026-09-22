import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { StudyData } from '../../domain/models';
import { NotesScreen } from '../redesign/screens/NotesScreen';

const noop = () => undefined;
const data: StudyData = {
  activity: [], tasks: [], reminders: [], habits: [], goals: [], blocks: [], telemetry: [],
  notes: [
    { id: 'one', title: 'Plano da semana', content: 'Manter o foco sem abrir novas abas.', folder: 'Bento', createdAt: '2026-09-20T10:00:00Z', updatedAt: '2026-09-20T11:00:00Z' },
    { id: 'two', title: 'Referências', content: 'Uma nota longa que continua sendo texto simples.', folder: 'Design', createdAt: '2026-09-19T10:00:00Z', updatedAt: '2026-09-19T11:00:00Z' },
  ],
};

describe('NotesScreen', () => {
  it('organizes notes as a redesigned searchable workspace with an editor action', () => {
    const markup = renderToStaticMarkup(<NotesScreen data={data} onCreate={noop} onUpdate={noop} onDelete={noop} />);

    expect(markup).toContain('Notes');
    expect(markup).toContain('Plano da semana');
    expect(markup).toContain('Referências');
    expect(markup).toContain('Pesquisar notas');
    expect(markup).toContain('Nova nota');
    expect(markup).toContain('Editar Plano da semana');
    expect(markup).toContain('Excluir Plano da semana');
    expect(markup).toContain('notes-screen');
  });

  it('preserves an explicit folder selection and gives an honest empty state', () => {
    const markup = renderToStaticMarkup(<NotesScreen data={data} initialFolder="Sem notas" onCreate={noop} onUpdate={noop} onDelete={noop} />);

    expect(markup).toContain('Nenhuma nota nesta pasta');
    expect(markup).toContain('Criar nota em Sem notas');
    expect(markup).not.toContain('Plano da semana');
  });
});

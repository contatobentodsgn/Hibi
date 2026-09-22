import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { StudyData } from '../../domain/models';
import { TasksScreen } from '../redesign/screens/TasksScreen';

const noop = () => undefined;

const tasksData: StudyData = {
  activity: [],
  notes: [],
  reminders: [],
  habits: [],
  goals: [],
  blocks: [],
  telemetry: [],
  tasks: [
    { id: 'overdue', title: 'Entregar a proposta longa', durationMinutes: 45, category: 'work', status: 'open', folder: 'Clientes', deadline: '2026-09-16T10:00:00' },
    { id: 'today', title: 'Revisar a identidade', durationMinutes: 30, category: 'important', status: 'open', folder: 'Design', deadline: '2026-09-17T16:00:00' },
    { id: 'done', title: 'Tarefa já concluída', durationMinutes: 15, category: 'work', status: 'completed', folder: 'Design' },
  ],
};

describe('TasksScreen', () => {
  it('prioritizes open tasks, exposes folders and keeps the task actions available', () => {
    const markup = renderToStaticMarkup(
      <TasksScreen
        data={tasksData}
        today="2026-09-17"
        onEvent={noop}
        onTaskStatusChange={noop}
        onCreateTask={noop}
        onRenameTask={noop}
        onDeleteTask={noop}
        onEditTaskDeadline={noop}
      />,
    );

    expect(markup).toContain('Entregar a proposta longa');
    expect(markup).toContain('Revisar a identidade');
    expect(markup).not.toContain('Tarefa já concluída');
    expect(markup).toContain('Atrasada');
    expect(markup).toContain('Hoje');
    expect(markup).toContain('Clientes');
    expect(markup).toContain('Design');
    expect(markup).toContain('Criar tarefa');
    expect(markup).toContain('Concluir tarefa Entregar a proposta longa');
  });

  it('shows an honest empty state for a selected folder without tasks', () => {
    const markup = renderToStaticMarkup(
      <TasksScreen
        data={{ ...tasksData, tasks: [], notes: [{ id: 'note', title: 'Referência', content: '', folder: 'Arquivada', createdAt: '', updatedAt: '' }] }}
        today="2026-09-17"
        initialFolder="Arquivada"
        onEvent={noop}
        onTaskStatusChange={noop}
        onCreateTask={noop}
      />,
    );

    expect(markup).toContain('Nenhuma tarefa nesta pasta');
    expect(markup).toContain('Criar tarefa em Arquivada');
  });
});

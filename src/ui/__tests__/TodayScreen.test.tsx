import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createSeedData } from '../../data/seed-data';
import { todayKey } from '../../domain/date-context';
import { TodayScreen } from '../redesign/screens/TodayScreen';

const noop = () => undefined;
const now = new Date(2026, 8, 17, 9, 30, 0);
const day = todayKey(now);

describe('TodayScreen', () => {
  it('shows the current commitment, only open priority tasks, and the paths to the daily views', () => {
    const data = {
      ...createSeedData(),
      blocks: [
        { id: 'now', title: 'Revisão do planejamento semanal', start: `${day}T09:00:00`, end: `${day}T10:00:00`, category: 'important' as const },
        { id: 'later', title: 'Organizar referências visuais', start: `${day}T14:00:00`, end: `${day}T15:00:00`, category: 'work' as const },
      ],
      tasks: [
        { id: 'open', title: 'Refinar a identidade do Hibi', durationMinutes: 60, category: 'important' as const, status: 'open' as const },
        { id: 'done', title: 'Já concluída', durationMinutes: 30, category: 'work' as const, status: 'completed' as const },
      ],
    };

    const markup = renderToStaticMarkup(<TodayScreen data={data} now={now} onNavigate={noop} onOpenCommands={noop} />);

    expect(markup).toContain('Revisão do planejamento semanal');
    expect(markup).toContain('Refinar a identidade do Hibi');
    expect(markup).not.toContain('Já concluída');
    expect(markup).toContain('Ver calendário diário');
    expect(markup).toContain('Ver Rotina');
    expect(markup).toContain('Ver Progresso');
    expect(markup).toContain('Ver Tendências');
    expect(markup).toContain('Abrir revisão');
  });

  it('uses an honest empty state when there is no commitment today', () => {
    const data = { ...createSeedData(), blocks: [], tasks: [] };
    const markup = renderToStaticMarkup(<TodayScreen data={data} now={now} onNavigate={noop} onOpenCommands={noop} />);

    expect(markup).toContain('Seu dia está livre');
    expect(markup).toContain('Nada agendado para agora.');
    expect(markup).not.toContain('Revisão do planejamento semanal');
  });

  it('renders the local calendar week across a month boundary', () => {
    const firstOfMonth = new Date(2026, 8, 1, 9, 30, 0);
    const markup = renderToStaticMarkup(<TodayScreen data={{ ...createSeedData(), blocks: [], tasks: [] }} now={firstOfMonth} onNavigate={noop} onOpenCommands={noop} />);

    expect(markup).toContain('seg<strong>31</strong>');
    expect(markup).toContain('ter<strong>1</strong>');
    expect(markup).toContain('dom<strong>6</strong>');
  });

  it('shows the deadline-prioritized open tasks and excludes paused tasks', () => {
    const data = {
      ...createSeedData(),
      blocks: [],
      tasks: [
        ...Array.from({ length: 4 }, (_, index) => ({ id: `later-${index}`, title: `Sem prazo ${index}`, durationMinutes: 30, category: 'work' as const, status: 'open' as const })),
        { id: 'today', title: 'Entrega de hoje', deadline: `${day}T17:00:00`, durationMinutes: 30, category: 'work' as const, status: 'open' as const },
        { id: 'important', title: 'Importante sem prazo', durationMinutes: 30, category: 'important' as const, status: 'open' as const },
        { id: 'paused', title: 'Tarefa pausada', durationMinutes: 30, category: 'important' as const, status: 'paused' as const },
      ],
    };
    const markup = renderToStaticMarkup(<TodayScreen data={data} now={now} onNavigate={noop} onOpenCommands={noop} />);

    expect(markup).toContain('Entrega de hoje');
    expect(markup).toContain('Importante sem prazo');
    expect(markup).not.toContain('Tarefa pausada');
  });

  it('uses recorded focus activity for real week and month progress controls', () => {
    const data = {
      ...createSeedData(),
      blocks: [{ id: 'past-plan', title: 'Planejamento que passou', start: `${day}T08:00:00`, end: `${day}T09:00:00`, category: 'work' as const }],
      activity: [{ id: 'focus-1', schemaVersion: 1 as const, type: 'focus.completed', at: `${day}T08:55:00.000Z`, durationMinutes: 25, seeded: false }],
    };
    const markup = renderToStaticMarkup(<TodayScreen data={data} now={now} onNavigate={noop} onOpenCommands={noop} />);

    expect(markup).toContain('Semana');
    expect(markup).toContain('Mês');
    expect(markup).toContain('25m');
    expect(markup).toContain('registrados em foco');
    expect(markup).not.toContain('blocos concluídos');
  });
});

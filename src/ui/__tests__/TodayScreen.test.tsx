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
});

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { StudyData } from '../../domain/models';
import { AgendaScreen } from '../redesign/screens/AgendaScreen';

const data: StudyData = { activity: [], notes: [], tasks: [], habits: [], goals: [], reminders: [], telemetry: [], blocks: [
  { id: 'early', title: 'Caminhada cedo', start: '2026-09-20T06:30:00', end: '2026-09-20T07:15:00', category: 'break' },
  { id: 'focus', title: 'Projeto Hibi', start: '2026-09-20T10:00:00', end: '2026-09-20T11:30:00', category: 'work' },
] };

describe('AgendaScreen', () => {
  it('shows the active period, day and week controls, and blocks outside the old working-hours range', () => {
    const markup = renderToStaticMarkup(<AgendaScreen data={data} mode="day" date="2026-09-20" onModeChange={() => undefined} onDateChange={() => undefined} onCreateBlock={() => undefined} onDeleteBlock={() => undefined} onEvent={() => undefined} />);
    expect(markup).toContain('Agenda');
    expect(markup).toContain('Dia');
    expect(markup).toContain('Semana');
    expect(markup).toContain('06:00');
    expect(markup).toContain('Caminhada cedo');
    expect(markup).toContain('Projeto Hibi');
  });
});

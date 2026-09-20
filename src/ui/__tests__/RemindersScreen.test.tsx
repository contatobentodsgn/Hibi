import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { StudyData } from '../../domain/models';
import { RemindersScreen } from '../redesign/screens/RemindersScreen';

const data: StudyData = { activity: [], notes: [], tasks: [], habits: [], goals: [], blocks: [], telemetry: [], reminders: [
  { id: 'daily', title: 'Beber água', category: 'wellbeing', status: 'open', schedule: { at: '2026-09-20T09:00:00', recurrence: { frequency: 'daily', time: '09:00', startDate: '2026-09-01' } } },
  { id: 'paused', title: 'Pausa', category: 'important', status: 'paused', schedule: { at: '2026-09-20T12:00:00' } },
] };
const noop = () => undefined;
describe('RemindersScreen', () => {
  it('shows recurrence and paused state as distinct reminder information', () => {
    const markup = renderToStaticMarkup(<RemindersScreen data={data} onEvent={noop} onReminderStatusChange={noop} onCreateReminder={noop} />);
    expect(markup).toContain('Beber água'); expect(markup).toContain('Todos os dias · 09:00'); expect(markup).toContain('Pausado'); expect(markup).toContain('Novo lembrete');
  });
});

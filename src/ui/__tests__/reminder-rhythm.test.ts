import { describe, expect, it } from 'vitest';
import { deriveReminderRhythm } from '../reminder-rhythm';

describe('deriveReminderRhythm', () => {
  it('finds the next local recurrence and labels stale one-time reminders', () => {
    const reminders = [
      { id: 'daily', title: 'Daily', category: 'wellbeing' as const, schedule: { at: '2026-09-14T09:00:00', recurrence: { frequency: 'daily' as const, time: '09:00', startDate: '2026-09-14' } } },
      { id: 'later', title: 'Later', category: 'wellbeing' as const, schedule: { at: '2026-09-14T10:00:00', recurrence: { frequency: 'daily' as const, time: '10:00', startDate: '2026-09-14' } } },
      { id: 'late', title: 'Late', category: 'important' as const, schedule: { at: '2026-09-13T09:00:00' } },
      { id: 'paused', title: 'Paused', category: 'wellbeing' as const, status: 'paused' as const, schedule: { at: '2026-09-14T08:00:00' } },
    ];
    const rhythm = deriveReminderRhythm(reminders, new Date(2026, 8, 14, 8, 30));
    expect(rhythm).toMatchObject({ next: reminders[0], overdue: 1, paused: 1, stateById: { late: 'overdue', paused: 'paused' } });
  });
});

import { describe, expect, it } from 'vitest';
import { createSeedData } from '../../data/seed-data';
import { buildNotificationEntries } from '../notifications';

describe('buildNotificationEntries', () => {
  it('includes active reminders and open task deadlines only', () => {
    const data = createSeedData();
    data.tasks.push(
      { id: 'deadline-open', title: 'Submit paper', durationMinutes: 30, category: 'work', status: 'open', deadline: '2026-09-08T17:00:00-03:00' },
      { id: 'deadline-completed', title: 'Already submitted', durationMinutes: 30, category: 'work', status: 'completed', deadline: '2026-09-08T18:00:00-03:00' },
      { id: 'no-deadline', title: 'No deadline', durationMinutes: 30, category: 'work', status: 'open' },
    );
    data.reminders.push(
      { id: 'paused-reminder', title: 'Paused reminder', category: 'wellbeing', status: 'paused', schedule: { at: '2026-09-08T19:00:00' } },
    );

    expect(buildNotificationEntries(data)).toEqual([
      {
        id: 'deadline:deadline-open',
        kind: 'deadline',
        title: 'Deadline: Submit paper',
        body: 'Task deadline reached.',
        at: '2026-09-08T17:00:00-03:00',
      },
      {
        id: 'reminder:horizontes',
        kind: 'reminder',
        title: 'vaga/inglês - Horizontes',
        body: 'Important reminder.',
        // O seed é ancorado no dia em que roda, então a data sai dele — fixá-la aqui só valeria
        // enquanto a data real estivesse na janela antiga do seed.
        at: data.reminders[0].schedule.at,
        recurrence: data.reminders[0].schedule.recurrence,
      },
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { createSeedData } from '../seed-data';

describe('createSeedData', () => {
  it('gives every call its own independent copies', () => {
    const first = createSeedData();
    const second = createSeedData();

    first.tasks.push({ id: 'extra', title: 'Extra task', durationMinutes: 30, category: 'work', folder: 'Bento' });
    first.tasks[0].title = 'Mutated title';
    first.reminders[0].schedule.at = '2026-09-09T09:00:00-03:00';

    expect(second.tasks).toHaveLength(8);
    expect(second.tasks[0].title).toBe('Kabrito Post 01');
    // `reminder` was already built fresh per call before this fix, so this assertion doesn't guard
    // anything today; kept as future-proofing. `tasks` above is what the independent-copies fix protects.
    expect(second.reminders[0].schedule.at).toBe('2026-09-08T09:00:00-03:00');
  });
});

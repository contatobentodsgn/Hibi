import { describe, expect, it } from 'vitest';
import { firstWeeklyOccurrence } from '../recurrence';

describe('firstWeeklyOccurrence', () => {
  it('anchors a Tuesday recurrence to Tuesday', () => {
    expect(firstWeeklyOccurrence('2026-09-07', ['Tue 09:00', 'Wed 20:00'])).toEqual({ date: '2026-09-08', time: '09:00' });
  });

  it('selects the earliest configured occurrence and rejects invalid entries', () => {
    expect(firstWeeklyOccurrence('2026-09-07', ['Wed 20:00', 'Tue 09:00', 'Nope'])).toEqual({ date: '2026-09-08', time: '09:00' });
    expect(firstWeeklyOccurrence('2026-09-07', ['Nope'])).toBeUndefined();
  });
});

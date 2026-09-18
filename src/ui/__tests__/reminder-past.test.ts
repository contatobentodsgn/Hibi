import { describe, expect, it } from 'vitest';
import { isPastWallClock } from '../ReminderCreateModal';

describe('lembrete único no passado', () => {
  const now = new Date(2026, 8, 20, 10, 30, 15);

  it('o minuto atual e antes dele já passaram', () => {
    expect(isPastWallClock('2026-09-20', '10:30', now)).toBe(true);
    expect(isPastWallClock('2026-09-20', '09:59', now)).toBe(true);
    expect(isPastWallClock('2026-09-19', '23:00', now)).toBe(true);
  });

  it('o minuto seguinte e os outros dias ainda não', () => {
    expect(isPastWallClock('2026-09-20', '10:31', now)).toBe(false);
    expect(isPastWallClock('2026-09-21', '08:00', now)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { localNoon } from '../date-context';
import { firstWeeklyOccurrence } from '../recurrence';

describe('firstWeeklyOccurrence', () => {
  it('anchors a Tuesday recurrence to Tuesday', () => {
    expect(firstWeeklyOccurrence('2026-09-07', ['Tue 09:00', 'Wed 20:00'])).toEqual({ date: '2026-09-08', time: '09:00' });
  });

  it('selects the earliest configured occurrence and rejects invalid entries', () => {
    expect(firstWeeklyOccurrence('2026-09-07', ['Wed 20:00', 'Tue 09:00', 'Nope'])).toEqual({ date: '2026-09-08', time: '09:00' });
    expect(firstWeeklyOccurrence('2026-09-07', ['Nope'])).toBeUndefined();
  });

  // 2026-09-07 é uma segunda. O dia devolvido tem que ser mesmo o dia-da-semana pedido em qualquer
  // fuso: ancorado em `-03:00`, em UTC+14 a terça voltava como 07/09, que é segunda.
  it('lands on the requested weekday in any timezone, wrapping into the next week', () => {
    expect(firstWeeklyOccurrence('2026-09-07', ['Mon 08:00'])).toEqual({ date: '2026-09-07', time: '08:00' });
    expect(firstWeeklyOccurrence('2026-09-07', ['Sun 08:00'])).toEqual({ date: '2026-09-13', time: '08:00' });
    expect(localNoon(firstWeeklyOccurrence('2026-09-07', ['Tue 09:00'])!.date).getDay()).toBe(2);
  });
});

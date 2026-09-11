import { describe, expect, it } from 'vitest';
import { localDateKey, localNoon, shiftDayKey, todayKey } from '../date-context';

// Todas as datas são montadas com componentes locais, então os testes valem em qualquer fuso —
// inclusive no America/Sao_Paulo do CI, onde o dia UTC vira o seguinte a partir das 21h.
describe('todayKey', () => {
  it('keeps the local calendar day at every hour, including the ones UTC has already advanced', () => {
    for (let hour = 0; hour < 24; hour += 1) {
      expect(todayKey(new Date(2026, 8, 11, hour, 30))).toBe('2026-09-11');
    }
  });

  it('pads month and day to two digits', () => {
    expect(todayKey(new Date(2026, 0, 5, 12))).toBe('2026-01-05');
  });

  it('reads the real clock when no instant is given', () => {
    const now = new Date();
    expect(todayKey()).toBe(localDateKey(now));
  });
});

describe('localNoon', () => {
  it('lands at noon of the local day, so formatting never spills into a neighbouring day', () => {
    const noon = localNoon('2026-09-11');

    expect([noon.getFullYear(), noon.getMonth(), noon.getDate(), noon.getHours()]).toEqual([2026, 8, 11, 12]);
    expect(localDateKey(noon)).toBe('2026-09-11');
  });
});

describe('shiftDayKey', () => {
  it('moves by whole days and crosses months and years', () => {
    expect(shiftDayKey('2026-09-11', 1)).toBe('2026-09-12');
    expect(shiftDayKey('2026-09-11', -1)).toBe('2026-09-10');
    expect(shiftDayKey('2026-09-11', 7)).toBe('2026-09-18');
    expect(shiftDayKey('2026-09-30', 1)).toBe('2026-10-01');
    expect(shiftDayKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDayKey('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('returns the same day for a zero shift', () => {
    expect(shiftDayKey('2026-09-11', 0)).toBe('2026-09-11');
  });
});

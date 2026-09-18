import { describe, expect, it } from 'vitest';
import { overlappingPairs } from '../../domain/conflicts';
import type { ScheduleBlock } from '../../domain/models';
import { visibleHours } from '../calendar-grid';

const block = (id: string, start: string, end: string): ScheduleBlock => ({ id, title: id, start, end, category: 'work' });

describe('horas da grade', () => {
  it('sem blocos fora do dia de trabalho, mostra 08h–22h', () => {
    const hours = visibleHours([block('a', '2026-09-11T10:00:00', '2026-09-11T11:00:00')]);
    expect(hours[0]).toBe(8);
    expect(hours.at(-1)).toBe(22);
    expect(hours).toHaveLength(15);
  });

  it('um bloco cedo ou tarde estende a grade até a hora dele', () => {
    const hours = visibleHours([block('cedo', '2026-09-11T06:30:00', '2026-09-11T07:00:00'), block('tarde', '2026-09-11T23:00:00', '2026-09-11T23:45:00')]);
    expect(hours[0]).toBe(6);
    expect(hours.at(-1)).toBe(23);
    expect(hours).toHaveLength(18);
  });

  it('24h mostra todas as horas', () => {
    expect(visibleHours([], true)).toEqual(Array.from({ length: 24 }, (_, hour) => hour));
  });
});

describe('blocos sobrepostos', () => {
  it('lista cada par uma vez, na ordem de início', () => {
    const pairs = overlappingPairs([
      block('c', '2026-09-11T10:30:00', '2026-09-11T11:30:00'),
      block('a', '2026-09-11T10:00:00', '2026-09-11T11:00:00'),
      block('b', '2026-09-11T11:00:00', '2026-09-11T12:00:00'),
    ]);
    expect(pairs.map(([first, second]) => `${first.id}×${second.id}`)).toEqual(['a×c', 'c×b']);
  });

  it('blocos encostados não se sobrepõem', () => {
    expect(overlappingPairs([block('a', '2026-09-11T10:00:00', '2026-09-11T11:00:00'), block('b', '2026-09-11T11:00:00', '2026-09-11T12:00:00')])).toEqual([]);
  });
});

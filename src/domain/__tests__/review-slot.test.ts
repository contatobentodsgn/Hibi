import { describe, expect, it } from 'vitest';
import type { ScheduleBlock } from '../models';
import { findFreeSlot } from '../review-slot';

const block = (start: string, end: string): ScheduleBlock => ({ id: start, title: 'Ocupado', start, end, category: 'work' });
const now = new Date(2026, 8, 14, 10, 10);

describe('horário livre para uma tarefa sem agenda', () => {
  it('começa na próxima meia hora de hoje', () => {
    expect(findFreeSlot({ blocks: [], durationMinutes: 60, now, lastDay: '2026-09-15' })).toEqual({ start: '2026-09-14T10:30:00', end: '2026-09-14T11:30:00' });
  });

  it('pula o que já está ocupado, sem encostar por dentro', () => {
    const blocks = [block('2026-09-14T10:30:00', '2026-09-14T12:00:00'), block('2026-09-14T12:30:00', '2026-09-14T13:00:00')];
    expect(findFreeSlot({ blocks, durationMinutes: 45, now, lastDay: '2026-09-15' })).toEqual({ start: '2026-09-14T13:00:00', end: '2026-09-14T13:45:00' });
  });

  it('passa para o dia seguinte quando hoje não cabe, começando às 08h', () => {
    const late = new Date(2026, 8, 14, 21, 40);
    expect(findFreeSlot({ blocks: [], durationMinutes: 60, now: late, lastDay: '2026-09-15' })).toEqual({ start: '2026-09-15T08:00:00', end: '2026-09-15T09:00:00' });
  });

  it('não passa do dia do prazo', () => {
    const blocks = [block('2026-09-14T08:00:00', '2026-09-14T22:00:00')];
    expect(findFreeSlot({ blocks, durationMinutes: 30, now, lastDay: '2026-09-14' })).toBeNull();
  });

  it('um bloco que atravessa a meia-noite ocupa o começo do dia seguinte', () => {
    const late = new Date(2026, 8, 14, 23, 0);
    const blocks = [block('2026-09-14T23:00:00', '2026-09-15T09:00:00')];
    expect(findFreeSlot({ blocks, durationMinutes: 30, now: late, lastDay: '2026-09-15' })).toEqual({ start: '2026-09-15T09:00:00', end: '2026-09-15T09:30:00' });
  });
});

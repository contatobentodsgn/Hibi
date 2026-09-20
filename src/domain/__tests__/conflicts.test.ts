import { describe, expect, it } from 'vitest';
import { commitmentClashes, findConflicts, validateScheduleBlock } from '../conflicts';
import type { ScheduleBlock } from '../models';

const block = (id: string, start: string, end: string, category: ScheduleBlock['category'] = 'work'): ScheduleBlock => ({ id, title: id, start, end, category });

describe('schedule conflicts', () => {
  // Pedido do usuário: uma reunião não atrapalha a produção de um post. Sobreposição só é conflito
  // entre dois compromissos fixos, e mesmo assim não impede de marcar: é aviso.
  it('uma demanda divide o horário com qualquer coisa, sem conflito', () => {
    const post = block('Post 1', '2026-09-07T09:30:00', '2026-09-07T10:30:00');
    const meeting = { ...block('Reunião', '2026-09-07T10:00:00', '2026-09-07T11:00:00'), isHard: true };
    expect(findConflicts(meeting, [post])[0].severity).toBe('soft');
    expect(validateScheduleBlock(meeting, [post])).toMatchObject({ valid: true });
  });

  it('dois compromissos fixos no mesmo horário são conflito, mas continuam podendo ser marcados', () => {
    const lunch = { ...block('Almoço', '2026-09-07T12:00:00', '2026-09-07T14:00:00', 'break'), isHard: true };
    const meeting = { ...block('Reunião', '2026-09-07T13:00:00', '2026-09-07T14:00:00'), isHard: true };
    const result = validateScheduleBlock(meeting, [lunch]);
    expect(result.valid).toBe(true);
    expect(result.conflicts[0].severity).toBe('hard');
    expect(commitmentClashes([lunch, meeting])).toHaveLength(1);
    expect(commitmentClashes([lunch, { ...meeting, isHard: false }])).toHaveLength(0);
  });

  it('um horário final antes do inicial continua inválido', () => {
    expect(validateScheduleBlock(block('X', '2026-09-07T11:00:00', '2026-09-07T10:00:00'), []).valid).toBe(false);
  });

  it('allows adjacent blocks with no overlap', () => {
    const first = block('Post 1', '2026-09-07T09:00:00', '2026-09-07T10:00:00');
    const second = block('Post 2', '2026-09-07T10:00:00', '2026-09-07T11:00:00');
    expect(findConflicts(second, [first])).toEqual([]);
  });
});

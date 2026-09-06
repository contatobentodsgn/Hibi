import { durationMinutes } from './schedule';
import type { ScheduleBlock } from './models';

export type ConflictSeverity = 'hard' | 'soft';
export interface ScheduleConflict {
  proposedId: string;
  existingId: string;
  severity: ConflictSeverity;
  reason: string;
}

function overlaps(a: ScheduleBlock, b: ScheduleBlock): boolean {
  return Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);
}

export function findConflicts(proposed: ScheduleBlock, existing: ScheduleBlock[]): ScheduleConflict[] {
  return existing.filter((item) => item.id !== proposed.id && overlaps(proposed, item)).map((item) => ({
    proposedId: proposed.id,
    existingId: item.id,
    severity: 'hard',
    reason: item.category === 'break' ? `Sobreposição com ${item.title}` : `Sobreposição com ${item.title}`,
  }));
}

export function validateScheduleBlock(proposed: ScheduleBlock, existing: ScheduleBlock[]) {
  const errors: string[] = [];
  if (durationMinutes(proposed) <= 0) errors.push('O horário final deve ser posterior ao inicial.');
  const conflicts = findConflicts(proposed, existing);
  if (conflicts.some((conflict) => conflict.severity === 'hard')) errors.push('O bloco conflita com um compromisso fixo.');
  return { valid: errors.length === 0, errors, conflicts };
}

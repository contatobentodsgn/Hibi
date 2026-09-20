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

/**
 * Sobreposição não é erro: uma demanda (produzir um post) e um compromisso (uma reunião) dividem o mesmo
 * horário sem problema. É conflito de verdade — `hard` — só entre dois compromissos fixos (`isHard`),
 * como uma reunião na hora do almoço. O resto é `soft`, só para informar.
 */
export function findConflicts(proposed: ScheduleBlock, existing: ScheduleBlock[]): ScheduleConflict[] {
  return existing.filter((item) => item.id !== proposed.id && overlaps(proposed, item)).map((item) => ({
    proposedId: proposed.id,
    existingId: item.id,
    severity: proposed.isHard === true && item.isHard === true ? 'hard' : 'soft',
    reason: `Sobreposição com ${item.title}`,
  }));
}

/** Um bloco é válido com duração positiva; sobreposições voltam em `conflicts`, para quem pede avisar. */
export function validateScheduleBlock(proposed: ScheduleBlock, existing: ScheduleBlock[]) {
  const errors: string[] = [];
  if (durationMinutes(proposed) <= 0) errors.push('O horário final deve ser posterior ao inicial.');
  return { valid: errors.length === 0, errors, conflicts: findConflicts(proposed, existing) };
}

/** Cada par de blocos que se sobrepõe, uma vez só, na ordem em que começam. */
export function overlappingPairs(blocks: readonly ScheduleBlock[]): Array<readonly [ScheduleBlock, ScheduleBlock]> {
  const sorted = [...blocks].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const pairs: Array<readonly [ScheduleBlock, ScheduleBlock]> = [];
  sorted.forEach((block, index) => {
    for (const later of sorted.slice(index + 1)) if (overlaps(block, later)) pairs.push([block, later]);
  });
  return pairs;
}

/** Só os pares em que os dois são compromissos fixos: são eles que pedem atenção na agenda. */
export const commitmentClashes = (blocks: readonly ScheduleBlock[]) => overlappingPairs(blocks).filter(([first, second]) => first.isHard === true && second.isHard === true);

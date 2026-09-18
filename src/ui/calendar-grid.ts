import type { ScheduleBlock } from '../domain/models';

export const FIRST_HOUR = 8;
export const LAST_HOUR = 22;

/**
 * As linhas de hora da grade. O dia de trabalho, 08h–22h, é o padrão, mas um bloco fora dele não pode
 * sumir: ele continua ocupando horário, e antes ficava invisível. A grade se estende até a hora em que
 * ele começa. `fullDay` mostra as 24 horas.
 */
export function visibleHours(blocks: readonly ScheduleBlock[], fullDay = false): number[] {
  if (fullDay) return Array.from({ length: 24 }, (_, hour) => hour);
  const hours = blocks.map((block) => Number(block.start.slice(11, 13))).filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23);
  const first = Math.min(FIRST_HOUR, ...hours);
  const last = Math.max(LAST_HOUR, ...hours);
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

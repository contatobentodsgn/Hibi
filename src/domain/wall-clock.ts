import type { Reminder, ScheduleBlock } from './models';

// Horário de bloco e de lembrete é hora de parede local, flutuante: `2026-09-11T08:00:00`, sem fuso.
// 08:00 é 08:00 onde a pessoa estiver — a semântica de um `DTSTART` sem `TZID` no iCal, e a única que
// faz sentido num planner local-first de um usuário só. É também o que as telas sempre fizeram: Dia,
// Semana, Início e Lembretes leem dia e hora por fatia de string (`slice(0, 10)`, `slice(11, 16)`),
// sem olhar para o sufixo.
const FLOATING = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;
// Um instante de verdade: o que as versões antigas gravavam (`-03:00`, para qualquer usuário do
// mundo) e o que um provedor externo pode mandar (`Z`, ou outro offset qualquer).
const ABSOLUTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

// O dado já gravado carimbava `-03:00` em todo mundo, e a tela mostrava os dígitos de São Paulo —
// por fatia de string, ou pelo `timeZone` fixo que `i18n/format` usava. Converter o instante para a
// hora de parede DE SÃO PAULO, e só então soltar o sufixo, é o que preserva exatamente o que a
// pessoa via: `…T08:00:00-03:00` vira `…T08:00:00`, e `…T12:00:00Z` vira `…T09:00:00`.
const legacyWallClock = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

/** A hora de parede equivalente. Um valor já flutuante volta idêntico; um malformado, intocado. */
export function toFloatingWallClock(value: string): string {
  if (typeof value !== 'string' || FLOATING.test(value) || !ABSOLUTE.test(value)) return value;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return value;
  const parts: Record<string, string> = {};
  for (const part of legacyWallClock.formatToParts(instant)) parts[part.type] = part.value;
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

// As duas migrações abaixo são idempotentes por construção: o que elas produzem não casa mais com
// `ABSOLUTE`, então a segunda passada não reconhece nada para converter. E são conservadoras — sem
// nada a converter devolvem o MESMO objeto, sem cópia, como `repairWeeklyAnchor` já fazia.

export function toFloatingBlock(block: ScheduleBlock): ScheduleBlock {
  if (typeof block?.start !== 'string' || typeof block?.end !== 'string') return block;
  const start = toFloatingWallClock(block.start);
  const end = toFloatingWallClock(block.end);
  return start === block.start && end === block.end ? block : { ...block, start, end };
}

export function toFloatingReminder(reminder: Reminder): Reminder {
  const at = reminder?.schedule?.at;
  if (typeof at !== 'string') return reminder;
  const floating = toFloatingWallClock(at);
  return floating === at ? reminder : { ...reminder, schedule: { ...reminder.schedule, at: floating } };
}

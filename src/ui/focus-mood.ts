import type { FocusMood } from '../../electron/focus-presence.mjs';
import type { ActivityRecord } from '../domain/activity';
import { calculateStats, resolveStatsPeriod } from '../domain/stats';

// O humor do companion durante o foco escolhe entre os três loops do notebook (bored, normal, excited).
//
// DE ONDE ELE SAI
// O original tirava o humor de rastreamento de atividade: app em primeiro plano, domínio, URL e título da
// página. O Hibi não coleta nada disso, de propósito. O humor sai só do que o Hibi já registra:
// - entediado: uma ausência foi detectada e a pessoa ainda não voltou — o companion está esperando;
// - animado: já há 2 ou mais sessões de foco concluídas hoje antes desta, ou seja, a partir da terceira;
// - normal: o resto do tempo.
// Ritmo de digitação, pouco tempo ocioso, app em uso e navegador ficam de fora: ligar pouca digitação a
// tédio julgaria quem está lendo ou pensando.

/** Sessões concluídas hoje a partir das quais o companion trabalha animado. */
export const EXCITED_AFTER_COMPLETED_TODAY = 2;

/**
 * Sessões de foco concluídas hoje no registro local de atividade. É a mesma soma do /stats em "Hoje"
 * (`focus.completed`, dia do calendário local, registros semeados e inválidos de fora), então o companion
 * e a página de Estatísticas nunca discordam.
 */
export function focusSessionsCompletedToday(records: readonly ActivityRecord[], now: Date): number {
  return calculateStats(records, resolveStatsPeriod('today', now)).focusSessions;
}

export function deriveFocusMood(signals: Readonly<{ awayPending: boolean; completedToday: number }>): FocusMood {
  if (signals.awayPending) return 'bored';
  if (signals.completedToday >= EXCITED_AFTER_COMPLETED_TODAY) return 'excited';
  return 'normal';
}

// O registro de eventos da Instrumentação ia inteiro para o `localStorage` a cada ação, sem teto: com o app
// aberto o dia todo na barra de menus ele só crescia, e cada gravação copiava a lista toda.
export const EVENT_LOG_LIMIT = 500;

export type EventLogEntry = { id: number; at: string; route: string; action: string; detail: string; result?: string };

/** O evento novo na frente, com o id seguinte, e só os mais recentes dentro do teto. */
export function appendEventRecord<T extends EventLogEntry>(current: readonly T[], entry: Omit<T, 'id'>, limit = EVENT_LOG_LIMIT): T[] {
  const nextId = current.reduce((highest, event) => Math.max(highest, event.id), 0) + 1;
  return [{ ...entry, id: nextId } as T, ...current].slice(0, limit);
}

/** O registro guardado, já dentro do teto; qualquer coisa que não seja uma lista vira o padrão. */
export function loadEventLog<T extends EventLogEntry>(saved: string | null, fallback: T[], limit = EVENT_LOG_LIMIT): T[] {
  if (!saved) return fallback;
  try {
    const parsed: unknown = JSON.parse(saved);
    return Array.isArray(parsed) ? (parsed as T[]).slice(0, limit) : fallback;
  } catch { return fallback; }
}

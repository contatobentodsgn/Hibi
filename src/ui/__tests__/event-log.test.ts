import { describe, expect, it } from 'vitest';
import { appendEventRecord, EVENT_LOG_LIMIT, loadEventLog, type EventLogEntry } from '../event-log';

const entry = (id: number): EventLogEntry => ({ id, at: '10:00', route: 'home', action: 'a', detail: `d${id}` });

describe('registro de eventos', () => {
  it('o novo entra na frente com o id seguinte', () => {
    const next = appendEventRecord([entry(3), entry(1)], { at: '10:01', route: 'tasks', action: 'b', detail: 'novo' });
    expect(next.map((event) => event.id)).toEqual([4, 3, 1]);
  });

  it('nunca passa do teto, e o que sai é o mais antigo', () => {
    const full = Array.from({ length: EVENT_LOG_LIMIT }, (_, index) => entry(EVENT_LOG_LIMIT - index));
    const next = appendEventRecord(full, { at: '10:01', route: 'home', action: 'b', detail: 'novo' });
    expect(next).toHaveLength(EVENT_LOG_LIMIT);
    expect(next[0]!.detail).toBe('novo');
    expect(next.some((event) => event.id === 1)).toBe(false);
  });

  it('um registro guardado acima do teto é cortado ao carregar, e lixo vira o padrão', () => {
    const huge = JSON.stringify(Array.from({ length: EVENT_LOG_LIMIT * 3 }, (_, index) => entry(index)));
    expect(loadEventLog(huge, [])).toHaveLength(EVENT_LOG_LIMIT);
    expect(loadEventLog('{"x":1}', [entry(9)])).toEqual([entry(9)]);
    expect(loadEventLog('não é json', [entry(9)])).toEqual([entry(9)]);
    expect(loadEventLog(null, [entry(9)])).toEqual([entry(9)]);
  });
});

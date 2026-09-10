import { describe, expect, it } from 'vitest';
import type { ActivityRecord } from '../activity';
import { resolveStatsPeriod } from '../stats';
import { activityToCsv, activityToJson, recordsForPeriod } from '../stats-export';

// Horários sempre construídos a partir de datas locais, para o teste valer em qualquer fuso.
const local = (month: number, day: number, hour = 0, minute = 0, second = 0, ms = 0) =>
  new Date(2026, month - 1, day, hour, minute, second, ms).toISOString();

let sequence = 0;
const record = (type: string, at: string, extra: Partial<ActivityRecord> = {}): ActivityRecord => ({
  id: `activity-${++sequence}`,
  schemaVersion: 1,
  type,
  at,
  ...extra,
});

const HEADER = 'at,type,entityType,entityId,title,durationMinutes,category,folder,value';
const today = resolveStatsPeriod('today', new Date(2026, 8, 10, 12));

describe('recordsForPeriod', () => {
  it('keeps records inside the half-open period, sorted by time', () => {
    const late = record('task.completed', local(9, 10, 23, 59), { title: 'Late' });
    const start = record('task.completed', local(9, 10), { title: 'Start' });
    const middle = record('focus.completed', local(9, 10, 12), { durationMinutes: 25 });
    const before = record('task.completed', local(9, 9, 23, 59, 59, 999), { title: 'Before' });
    const end = record('task.completed', local(9, 11), { title: 'End' });

    expect(recordsForPeriod([late, end, middle, before, start], today)).toEqual([start, middle, late]);
  });

  it('excludes seeded records and records without a readable timestamp', () => {
    const real = record('task.completed', local(9, 10, 9), { title: 'Real' });
    const seeded = record('task.completed', local(9, 10, 10), { title: 'Seed', seeded: true });
    const unreadable = record('task.completed', 'not-a-date', { title: 'Broken' });

    expect(recordsForPeriod([seeded, unreadable, real], today)).toEqual([real]);
  });

  it('does not mutate the input order', () => {
    const second = record('task.completed', local(9, 10, 11));
    const first = record('task.completed', local(9, 10, 9));
    const input = [second, first];
    recordsForPeriod(input, today);
    expect(input).toEqual([second, first]);
  });
});

describe('activityToCsv', () => {
  it('writes the fixed header and one CRLF-terminated row per record', () => {
    const at = local(9, 10, 9);
    const csv = activityToCsv([
      record('task.completed', at, { entityType: 'task', entityId: 'task-1', title: 'Post', durationMinutes: 30, category: 'work', folder: 'Clientes' }),
      record('goal.progressed', at, { entityType: 'goal', entityId: 'goal-1', value: 3 }),
    ]);

    expect(csv).toBe(`${HEADER}\r\n${at},task.completed,task,task-1,Post,30,work,Clientes,\r\n${at},goal.progressed,goal,goal-1,,,,,3\r\n`);
  });

  it('writes only the header for an empty period', () => {
    expect(activityToCsv([])).toBe(`${HEADER}\r\n`);
  });

  it('quotes fields with quotes, commas and line breaks (RFC 4180)', () => {
    const at = local(9, 10, 9);
    const rows = activityToCsv([
      record('task.completed', at, { title: 'Diz "oi", tchau' }),
      record('task.completed', at, { title: 'Linha 1\nLinha 2' }),
      record('task.completed', at, { title: 'Volta\r\nfinal' }),
    ]).split('\r\n');

    expect(rows[1]).toBe(`${at},task.completed,,,"Diz ""oi"", tchau",,,,`);
    expect(activityToCsv([record('task.completed', at, { title: 'Linha 1\nLinha 2' })])).toContain(',"Linha 1\nLinha 2",');
    expect(activityToCsv([record('task.completed', at, { title: 'Volta\r\nfinal' })])).toContain(',"Volta\r\nfinal",');
    expect(rows).toHaveLength(6);
  });

  it.each([
    ['=SOMA(A1:A9)', "'=SOMA(A1:A9)"],
    ['+5511999999999', "'+5511999999999"],
    ['-2+3', "'-2+3"],
    ['@cmd', "'@cmd"],
    ['\tTab', "'\tTab"],
  ])('neutralizes a formula-like text cell %j', (title, expected) => {
    const csv = activityToCsv([record('task.completed', local(9, 10, 9), { title })]);
    expect(csv.split('\r\n')[1]).toContain(`,${expected},`);
  });

  it('neutralizes a text cell starting with CR and still quotes it', () => {
    const csv = activityToCsv([record('task.completed', local(9, 10, 9), { folder: '\r=1' })]);
    expect(csv).toContain(`,"'\r=1",`);
  });

  it('neutralizes formula-like text in every text column, but not numbers', () => {
    const csv = activityToCsv([record('task.completed', local(9, 10, 9), { entityId: '=id', folder: '-Pasta', durationMinutes: 0, value: 12.5 })]);
    const row = csv.split('\r\n')[1];
    expect(row).toContain(",'=id,");
    expect(row).toContain(",'-Pasta,");
    expect(row.endsWith(',0,,\'-Pasta,12.5')).toBe(true);
  });

  it('does not leak fields outside the whitelist', () => {
    const leaky = { ...record('task.completed', local(9, 10, 9), { title: 'Ok', seeded: false }), apiKey: 'sk-secret', notes: 'private text' } as ActivityRecord;
    const csv = activityToCsv([leaky]);
    expect(csv).not.toContain('sk-secret');
    expect(csv).not.toContain('private text');
    expect(csv).not.toContain(leaky.id);
    expect(csv.split('\r\n')[1].split(',')).toHaveLength(9);
  });
});

describe('activityToJson', () => {
  it('serializes only whitelisted fields and omits missing ones', () => {
    const at = local(9, 10, 9);
    const leaky = {
      ...record('task.completed', at, { entityType: 'task', entityId: 'task-1', title: '=Post', durationMinutes: 30, category: 'work', seeded: false }),
      token: 'secret-token',
    } as ActivityRecord;
    const json = activityToJson([leaky, record('goal.progressed', at, { value: 2 })]);

    expect(json).not.toContain('secret-token');
    expect(JSON.parse(json)).toEqual([
      { at, type: 'task.completed', entityType: 'task', entityId: 'task-1', title: '=Post', durationMinutes: 30, category: 'work' },
      { at, type: 'goal.progressed', value: 2 },
    ]);
    expect(Object.keys(JSON.parse(json)[0])).toEqual(['at', 'type', 'entityType', 'entityId', 'title', 'durationMinutes', 'category']);
  });

  it('pretty prints an array, empty for an empty period', () => {
    expect(activityToJson([])).toBe('[]');
    expect(activityToJson([record('habit.completed', local(9, 10, 9))])).toContain('\n  {\n    "at": ');
  });
});

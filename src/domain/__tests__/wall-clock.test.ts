import { describe, expect, it } from 'vitest';
import { toFloatingBlock, toFloatingReminder, toFloatingWallClock } from '../wall-clock';
import type { Reminder, ScheduleBlock } from '../models';

const block = (start: string, end: string): ScheduleBlock => ({ id: 'bloco', title: 'Estudo', start, end, category: 'work' });
const reminder = (at: string): Reminder => ({ id: 'lembrete', title: 'Aula', category: 'important', status: 'open', schedule: { at } });

// Nenhuma asserção deste arquivo depende do relógio da máquina: o alvo da conversão é a hora de
// parede DE SÃO PAULO, que é a que a tela mostrava antes da migração — por fatia de string ou pelo
// `timeZone` fixo do `i18n/format`. A suíte roda também em Pacific/Kiritimati e Pacific/Midway.
describe('toFloatingWallClock', () => {
  it('preserva exatamente os dígitos que a pessoa via, soltando só o sufixo', () => {
    expect(toFloatingWallClock('2026-09-11T08:00:00-03:00')).toBe('2026-09-11T08:00:00');
  });

  it('traz um instante em UTC para a hora de parede de São Paulo', () => {
    expect(toFloatingWallClock('2026-09-11T12:00:00Z')).toBe('2026-09-11T09:00:00');
  });

  it('vira o dia junto com a hora quando o instante cai do outro lado da meia-noite', () => {
    expect(toFloatingWallClock('2026-09-12T02:00:00Z')).toBe('2026-09-11T23:00:00');
  });

  it('devolve idêntico o valor que já é hora de parede', () => {
    expect(toFloatingWallClock('2026-09-11T08:00:00')).toBe('2026-09-11T08:00:00');
    expect(toFloatingWallClock('2026-09-11T08:00')).toBe('2026-09-11T08:00');
  });

  it('na dúvida não mexe: o que não é um instante reconhecível volta como está', () => {
    for (const value of ['', 'ontem', '11/09/2026 08:00', '2026-09-11', '2026-09-11T08:00:00-0300', '2026-13-11T08:00:00Z']) {
      expect(toFloatingWallClock(value)).toBe(value);
    }
  });
});

describe('toFloatingBlock', () => {
  it('converte início e fim preservando o que a tela mostrava', () => {
    const migrated = toFloatingBlock(block('2026-09-11T08:00:00-03:00', '2026-09-11T09:00:00-03:00'));
    expect(migrated.start).toBe('2026-09-11T08:00:00');
    expect(migrated.end).toBe('2026-09-11T09:00:00');
  });

  it('não muta o bloco de entrada', () => {
    const original = block('2026-09-11T08:00:00-03:00', '2026-09-11T09:00:00-03:00');
    toFloatingBlock(original);
    expect(original.start).toBe('2026-09-11T08:00:00-03:00');
  });

  it('devolve o MESMO objeto quando já está flutuante, sem nem copiar', () => {
    const already = block('2026-09-11T08:00:00', '2026-09-11T09:00:00');
    expect(toFloatingBlock(already)).toBe(already);
  });

  it('é idempotente: a segunda passada devolve o mesmo objeto', () => {
    const once = toFloatingBlock(block('2026-09-11T12:00:00Z', '2026-09-11T13:00:00Z'));
    expect(once.start).toBe('2026-09-11T09:00:00');
    expect(once.end).toBe('2026-09-11T10:00:00');
    expect(toFloatingBlock(once)).toBe(once);
  });

  it('deixa intacto o bloco cujo horário não é texto', () => {
    const broken = { ...block('2026-09-11T08:00:00-03:00', '2026-09-11T09:00:00-03:00'), end: undefined } as unknown as ScheduleBlock;
    expect(toFloatingBlock(broken)).toBe(broken);
  });
});

describe('toFloatingReminder', () => {
  it('converte o horário do lembrete preservando o que a tela mostrava', () => {
    expect(toFloatingReminder(reminder('2026-09-11T08:00:00-03:00')).schedule.at).toBe('2026-09-11T08:00:00');
    expect(toFloatingReminder(reminder('2026-09-11T12:00:00Z')).schedule.at).toBe('2026-09-11T09:00:00');
  });

  it('preserva a recorrência ao reescrever o horário', () => {
    const weekly: Reminder = { ...reminder('2026-09-11T08:00:00-03:00'), schedule: { at: '2026-09-11T08:00:00-03:00', recurrence: { frequency: 'weekly', weekdays: [5], startDate: '2026-09-11' } } };
    expect(toFloatingReminder(weekly).schedule.recurrence).toEqual(weekly.schedule.recurrence);
  });

  it('devolve o MESMO objeto quando já está flutuante, sem nem copiar', () => {
    const already = reminder('2026-09-11T08:00:00');
    expect(toFloatingReminder(already)).toBe(already);
  });

  it('é idempotente: a segunda passada devolve o mesmo objeto', () => {
    const once = toFloatingReminder(reminder('2026-09-11T12:00:00Z'));
    expect(once.schedule.at).toBe('2026-09-11T09:00:00');
    expect(toFloatingReminder(once)).toBe(once);
  });

  it('deixa intacto o lembrete cujo horário não é texto', () => {
    const broken = { ...reminder('2026-09-11T08:00:00-03:00'), schedule: { at: undefined } } as unknown as Reminder;
    expect(toFloatingReminder(broken)).toBe(broken);
  });
});

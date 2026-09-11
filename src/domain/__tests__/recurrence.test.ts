import { describe, expect, it } from 'vitest';
import { localNoon } from '../date-context';
import type { Reminder } from '../models';
import { firstWeeklyOccurrence, repairWeeklyAnchor } from '../recurrence';

describe('firstWeeklyOccurrence', () => {
  it('anchors a Tuesday recurrence to Tuesday', () => {
    expect(firstWeeklyOccurrence('2026-09-07', ['Tue 09:00', 'Wed 20:00'])).toEqual({ date: '2026-09-08', time: '09:00' });
  });

  it('selects the earliest configured occurrence and rejects invalid entries', () => {
    expect(firstWeeklyOccurrence('2026-09-07', ['Wed 20:00', 'Tue 09:00', 'Nope'])).toEqual({ date: '2026-09-08', time: '09:00' });
    expect(firstWeeklyOccurrence('2026-09-07', ['Nope'])).toBeUndefined();
  });

  // 2026-09-07 é uma segunda. O dia devolvido tem que ser mesmo o dia-da-semana pedido em qualquer
  // fuso: ancorado em ``, em UTC+14 a terça voltava como 07/09, que é segunda.
  it('lands on the requested weekday in any timezone, wrapping into the next week', () => {
    expect(firstWeeklyOccurrence('2026-09-07', ['Mon 08:00'])).toEqual({ date: '2026-09-07', time: '08:00' });
    expect(firstWeeklyOccurrence('2026-09-07', ['Sun 08:00'])).toEqual({ date: '2026-09-13', time: '08:00' });
    expect(localNoon(firstWeeklyOccurrence('2026-09-07', ['Tue 09:00'])!.date).getDay()).toBe(2);
  });
});

// 2026-09-07 é segunda; 08 terça, 09 quarta, 14 a segunda seguinte. Nenhuma asserção aqui depende do
// fuso: dia e dia-da-semana saem de `localNoon`, e a suíte roda também em Pacific/Kiritimati (UTC+14).
const weeklyReminder = (at: string, weekdays: number[] | undefined, startDate: string, timesByWeekday?: Record<number, string>): Reminder => ({
  id: 'reminder-weekly', title: 'Aula de inglês', category: 'important', status: 'open',
  schedule: { at, recurrence: { frequency: 'weekly', weekdays, timesByWeekday, startDate } },
});

describe('repairWeeklyAnchor', () => {
  it('reancora o lembrete semanal cujo dia não é nenhum dos que ele repete', () => {
    // Exatamente o que o cálculo antigo gravava em UTC+14: terça pedida a partir de segunda 07/09
    // voltava como 07/09, que é segunda.
    const broken = weeklyReminder('2026-09-07T09:00:00', [2], '2026-09-07');
    const repaired = repairWeeklyAnchor(broken);

    expect(repaired.schedule.at).toBe('2026-09-08T09:00:00');
    expect(localNoon(repaired.schedule.at.slice(0, 10)).getDay()).toBe(2);
    expect(broken.schedule.at).toBe('2026-09-07T09:00:00');
  });

  it('devolve o lembrete já coerente pelo mesmo objeto, sem nem copiar', () => {
    const correct = weeklyReminder('2026-09-08T09:00:00', [2, 3], '2026-09-07', { 2: '09:00', 3: '20:00' });
    expect(repairWeeklyAnchor(correct)).toBe(correct);
  });

  it('não reancora um dia que não é o primeiro da recorrência mas é um dos que ela repete', () => {
    // A primeira ocorrência a partir de 07/09 seria terça 08; este `at` está numa quarta, que também
    // está em `weekdays`. Pode ser uma ocorrência legítima mais adiante — reescrever seria estragar.
    const later = weeklyReminder('2026-09-09T20:00:00', [2, 3], '2026-09-07', { 2: '09:00', 3: '20:00' });
    expect(repairWeeklyAnchor(later)).toBe(later);
  });

  it('é idempotente: a segunda passada não reconhece mais nada para corrigir', () => {
    const once = repairWeeklyAnchor(weeklyReminder('2026-09-07T09:00:00', [2], '2026-09-07'));
    expect(once.schedule.at).toBe('2026-09-08T09:00:00');
    expect(repairWeeklyAnchor(once)).toBe(once);
  });

  it('ignora lembretes de uma vez só e diários, que nunca passaram pelo cálculo semanal', () => {
    const oneTime: Reminder = { id: 'reminder-once', title: 'Consulta', category: 'wellbeing', status: 'open', schedule: { at: '2026-09-07T09:00:00' } };
    const daily: Reminder = { ...oneTime, schedule: { at: '2026-09-07T09:00:00', recurrence: { frequency: 'daily', time: '09:00', startDate: '2026-09-07' } } };

    expect(repairWeeklyAnchor(oneTime)).toBe(oneTime);
    expect(repairWeeklyAnchor(daily)).toBe(daily);
  });

  it('deixa intacto o semanal cujos campos não permitem afirmar que está errado', () => {
    const untouchable = [
      weeklyReminder('2026-09-07T09:00:00', undefined, '2026-09-07'),
      weeklyReminder('2026-09-07T09:00:00', [], '2026-09-07'),
      weeklyReminder('2026-09-07T09:00:00', [7], '2026-09-07'),
      weeklyReminder('2026-09-07T09:00:00', [2], '2026-02-31'),
      weeklyReminder('2026-09-07T09:00:00', [2], 'ontem'),
      weeklyReminder('07/09/2026 09:00', [2], '2026-09-07'),
      weeklyReminder('2026-02-31T09:00:00', [2], '2026-09-07'),
      weeklyReminder('2026-09-07T09:00:00', [2], '2026-09-07', { 2: 'manhã' }),
    ];

    for (const reminder of untouchable) expect(repairWeeklyAnchor(reminder)).toBe(reminder);
  });

  it('reescreve só dia e hora, preservando o sufixo do instante gravado', () => {
    expect(repairWeeklyAnchor(weeklyReminder('2026-09-07T09:00:00Z', [2], '2026-09-07')).schedule.at).toBe('2026-09-08T09:00:00Z');
    expect(repairWeeklyAnchor(weeklyReminder('2026-09-07T09:00', [2], '2026-09-07')).schedule.at).toBe('2026-09-08T09:00');
    // A hora vem do dia reancorado, não da que estava gravada junto do dia errado.
    expect(repairWeeklyAnchor(weeklyReminder('2026-09-07T20:00:00-03:00', [2, 3], '2026-09-07', { 2: '09:00', 3: '20:00' })).schedule.at).toBe('2026-09-08T09:00:00-03:00');
  });

  it('reancora na semana seguinte quando o dia pedido já passou no startDate', () => {
    expect(repairWeeklyAnchor(weeklyReminder('2026-09-09T08:00:00', [1], '2026-09-09')).schedule.at).toBe('2026-09-14T08:00:00');
  });
});

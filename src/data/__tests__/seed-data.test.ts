import { describe, expect, it } from 'vitest';
import { localNoon, todayKey } from '../../domain/date-context';
import type { StudyData } from '../../domain/models';
import { createSeedData } from '../seed-data';

// Os dias que o seed realmente povoou, lidos dos próprios blocos — é o que o app enxerga.
const dayKeys = (data: StudyData): string[] => [...new Set(data.blocks.map((block) => block.start.slice(0, 10)))].sort();
const blocksOn = (data: StudyData, day: string) => data.blocks.filter((block) => block.start.startsWith(day));

describe('createSeedData', () => {
  it('gives every call its own independent copies', () => {
    const first = createSeedData();
    const second = createSeedData();
    const reminderAt = second.reminders[0].schedule.at;

    first.tasks.push({ id: 'extra', title: 'Extra task', durationMinutes: 30, category: 'work', folder: 'Bento' });
    first.tasks[0].title = 'Mutated title';
    first.reminders[0].schedule.at = '1999-01-01T09:00:00';

    expect(second.tasks).toHaveLength(8);
    expect(second.tasks[0].title).toBe('Kabrito Post 01');
    // `reminder` was already built fresh per call before this fix, so this assertion doesn't guard
    // anything today; kept as future-proofing. `tasks` above is what the independent-copies fix protects.
    expect(second.reminders[0].schedule.at).toBe(reminderAt);
  });

  // O defeito que estes testes fecham: com datas fixas, instalar o app fora da janela do seed abria
  // num dia vazio e o produto parecia quebrado.
  it('povoa o dia em que foi gerado, seja qual for esse dia', () => {
    for (const now of [new Date(2027, 4, 13, 9), new Date(2030, 9, 1, 0, 5), new Date(2026, 8, 11, 18)]) {
      const data = createSeedData(now);
      expect(dayKeys(data)).toContain(todayKey(now));
      expect(blocksOn(data, todayKey(now))).toHaveLength(10);
    }
  });

  it('cobre hoje e os quatro dias seguintes, em dias consecutivos', () => {
    const data = createSeedData(new Date(2027, 4, 13, 9));
    expect(dayKeys(data)).toEqual(['2027-05-13', '2027-05-14', '2027-05-15', '2027-05-16', '2027-05-17']);
  });

  it('atravessa a virada de ano', () => {
    expect(dayKeys(createSeedData(new Date(2027, 11, 31, 23)))).toEqual(['2027-12-31', '2028-01-01', '2028-01-02', '2028-01-03', '2028-01-04']);
  });

  it('atravessa a virada de mês, inclusive num mês de 31 dias', () => {
    expect(dayKeys(createSeedData(new Date(2027, 0, 30, 8)))).toEqual(['2027-01-30', '2027-01-31', '2027-02-01', '2027-02-02', '2027-02-03']);
    expect(dayKeys(createSeedData(new Date(2027, 3, 29, 8)))).toEqual(['2027-04-29', '2027-04-30', '2027-05-01', '2027-05-02', '2027-05-03']);
  });

  it('conta o 29 de fevereiro num ano bissexto e o pula num ano comum', () => {
    expect(dayKeys(createSeedData(new Date(2028, 1, 29, 12)))).toEqual(['2028-02-29', '2028-03-01', '2028-03-02', '2028-03-03', '2028-03-04']);
    expect(dayKeys(createSeedData(new Date(2028, 1, 28, 12)))).toEqual(['2028-02-28', '2028-02-29', '2028-03-01', '2028-03-02', '2028-03-03']);
    expect(dayKeys(createSeedData(new Date(2027, 1, 28, 12)))).toEqual(['2027-02-28', '2027-03-01', '2027-03-02', '2027-03-03', '2027-03-04']);
  });

  // A armadilha do repo: `toISOString().slice(0, 10)` devolve o dia UTC, que a oeste de Greenwich já
  // é o seguinte no fim da noite. O seed tem que começar no dia do relógio de quem instalou.
  it('ancora no dia local, não no dia UTC, perto da meia-noite', () => {
    expect(dayKeys(createSeedData(new Date(2027, 5, 10, 23, 30)))[0]).toBe('2027-06-10');
    expect(dayKeys(createSeedData(new Date(2027, 5, 10, 0, 30)))[0]).toBe('2027-06-10');
  });

  it('preserva a forma da demonstração: dez blocos por dia e duas aulas de inglês na semana', () => {
    const data = createSeedData(new Date(2028, 1, 29, 12));
    const days = dayKeys(data);

    for (const day of days) expect(blocksOn(data, day).filter((block) => block.title !== 'Aula de inglês')).toHaveLength(10);
    expect(data.blocks.filter((block) => block.title === 'Aula de inglês').map((block) => block.start.slice(0, 16)))
      .toEqual([`${days[1]}T21:00`, `${days[3]}T08:00`]);
    expect(data.blocks.filter((block) => block.title === 'Almoço')).toHaveLength(5);
    expect(new Set(data.blocks.map((block) => block.id)).size).toBe(data.blocks.length);
  });

  it('mantém o lembrete semanal numa terça real, com a recorrência começando hoje', () => {
    for (const now of [new Date(2027, 11, 31, 23), new Date(2028, 1, 29, 12), new Date(2027, 4, 13, 9)]) {
      const reminder = createSeedData(now).reminders[0];
      // Terça-feira de verdade no calendário local, e não uma data fixa que por acaso era terça.
      expect(localNoon(reminder.schedule.at.slice(0, 10)).getDay()).toBe(2);
      expect(reminder.schedule.at.slice(0, 10) >= todayKey(now)).toBe(true);
      expect(reminder.schedule.recurrence?.startDate).toBe(todayKey(now));
      expect(reminder.schedule.recurrence?.weekdays).toEqual([2, 3]);
    }
  });
});

import { readFile } from 'node:fs/promises';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createSeedData } from '../../data/seed-data';
import { localDateKey, shiftDayKey, todayKey } from '../../domain/date-context';
import type { Habit, StudyData } from '../../domain/models';
import { HabitsView } from '../HabitsView';
import { progressFor, streakFor } from '../progress-rhythm';

// Tudo aqui é montado com os componentes locais da data e com um "hoje" injetado, então a suíte vale
// em qualquer fuso — inclusive nos extremos (UTC+14 e UTC-11), onde o dia UTC e o dia local divergem.
const noop = () => undefined;
const seed = createSeedData();

const habitWith = (completedDates: string[], overrides: Partial<Habit> = {}): Habit => ({
  id: 'habit-1',
  title: 'Read',
  frequency: 'daily',
  targetPerWeek: 7,
  completedDates,
  ...overrides,
});

const render = (habit: Habit, now?: Date) => {
  const data: StudyData = { ...seed, habits: [habit] };
  return renderToStaticMarkup(
    <HabitsView data={data} now={now} onCreate={noop} onToggleCompletion={noop} onUpdate={noop} onDelete={noop} />,
  );
};

const CHECKED = 'aria-label="Undo Read today"';
const UNCHECKED = 'aria-label="Complete Read today"';

// 2026-09-11 é uma sexta-feira; a semana local vai de 07 (segunda) a 13 (domingo).
const FRIDAY = '2026-09-11';
// Perto da meia-noite local o dia UTC se separa do dia do calendário: às 23:30 em fusos negativos e
// às 00:30 em fusos positivos. É exatamente onde o bug aparecia.
const NEAR_MIDNIGHT = [
  { label: '23:30', now: new Date(2026, 8, 11, 23, 30) },
  { label: '00:30', now: new Date(2026, 8, 11, 0, 30) },
];

describe('HabitsView today', () => {
  it('marks the real local day instead of a date frozen in the source', () => {
    const markup = render(habitWith([todayKey()]));

    expect(markup).toContain(CHECKED);
  });

  for (const { label, now } of NEAR_MIDNIGHT) {
    it(`uses the local calendar day at ${label}, not the UTC day`, () => {
      const local = localDateKey(now);
      expect(local).toBe(FRIDAY);

      expect(render(habitWith([local]), now)).toContain(CHECKED);
      expect(render(habitWith([shiftDayKey(local, 1)]), now)).toContain(UNCHECKED);
      expect(render(habitWith([shiftDayKey(local, -1)]), now)).toContain(UNCHECKED);

      // Onde os dois calendários discordam, quem manda é o local: uma marcação gravada no dia UTC
      // não é a de hoje.
      const utc = now.toISOString().slice(0, 10);
      if (utc !== local) expect(render(habitWith([utc]), now)).toContain(UNCHECKED);
    });
  }

  it('writes the completion to the resolved local day', async () => {
    const source = await readFile(new URL('../HabitsView.tsx', import.meta.url), 'utf8');

    expect(source).toContain('onToggleCompletion(habit.id, today, !completedToday)');
    expect(source).toContain('todayKey(now)');
    expect(source).not.toContain('toISOString().slice');
    expect(source).not.toMatch(/const TODAY = '\d{4}-\d{2}-\d{2}'/);
    // Nenhum literal ISO com offset fixo: é assim que um dia de calendário vira instante e escorrega.
    expect(source).not.toMatch(/T\d{2}:\d{2}:\d{2}[-+]\d{2}:\d{2}/);
  });

  it('reports the streak and the period progress of the injected day', () => {
    const markup = render(habitWith([FRIDAY, '2026-09-10']), NEAR_MIDNIGHT[0].now);

    expect(markup).toContain('1/1 this period');
    expect(markup).toContain('2 day streak');
  });
});

describe('streakFor', () => {
  it('counts consecutive days backwards from today', () => {
    expect(streakFor(habitWith([FRIDAY, '2026-09-10', '2026-09-09']), FRIDAY)).toBe(3);
  });

  it('is zero while today is still unchecked, however long yesterday ran', () => {
    expect(streakFor(habitWith(['2026-09-10', '2026-09-09']), FRIDAY)).toBe(0);
  });

  it('stops at the first missing day', () => {
    expect(streakFor(habitWith([FRIDAY, '2026-09-09']), FRIDAY)).toBe(1);
  });

  it('crosses month and year boundaries on the local calendar', () => {
    expect(streakFor(habitWith(['2026-10-01', '2026-09-30']), '2026-10-01')).toBe(2);
    expect(streakFor(habitWith(['2027-01-01', '2026-12-31']), '2027-01-01')).toBe(2);
  });
});

describe('progressFor', () => {
  it('counts a daily habit against today alone', () => {
    expect(progressFor(habitWith([FRIDAY]), FRIDAY)).toEqual({ completed: 1, target: 1 });
    expect(progressFor(habitWith(['2026-09-10']), FRIDAY)).toEqual({ completed: 0, target: 1 });
  });

  it('counts a weekly habit inside the local Monday-to-Sunday week of today', () => {
    const weekly = habitWith(['2026-09-07', '2026-09-13', '2026-09-06', '2026-09-14'], { frequency: 'weekly', targetPerWeek: 3 });

    expect(progressFor(weekly, FRIDAY)).toEqual({ completed: 2, target: 3 });
  });
});

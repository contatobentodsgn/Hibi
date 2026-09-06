import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createSeedData } from '../../data/seed-data';
import { DayView } from '../DayView';
import { RemindersView } from '../RemindersView';
import { SettingsView } from '../SettingsView';
import { TasksView } from '../TasksView';
import { WeekView } from '../WeekView';

const data = createSeedData();
const onEvent = () => undefined;

describe('study views', () => {
  it('renders tasks from the study snapshot', () => {
    const markup = renderToStaticMarkup(
      <TasksView data={data} onEvent={onEvent} onTaskStatusChange={onEvent} />,
    );

    expect(markup).toContain('Kabrito Post 01');
    expect(markup).toContain('Marina Post 02');
    expect(markup).toContain('8 open');
  });

  it('renders reminders from the study snapshot', () => {
    const markup = renderToStaticMarkup(
      <RemindersView data={data} onEvent={onEvent} onReminderStatusChange={onEvent} />,
    );

    expect(markup).toContain('vaga/inglês - Horizontes');
    expect(markup).toContain('Tue 09:00 · Wed 20:00');
    expect(markup).toContain('1 active');
  });

  it('renders the seeded day blocks', () => {
    const markup = renderToStaticMarkup(
      <DayView data={data} onEvent={onEvent} onCreateBlock={onEvent} />,
    );

    expect(markup).toContain('MONDAY · 07 SEPTEMBER 2026');
    expect(markup).toContain('Kabrito Post 01');
    expect(markup).toContain('Almoço');
  });

  it('renders seeded blocks across the week', () => {
    const markup = renderToStaticMarkup(
      <WeekView data={data} onEvent={onEvent} onCreateBlock={onEvent} />,
    );

    expect(markup).toContain('Mon 07 — Sun 13');
    expect(markup).toContain('Aula de inglês');
    expect(markup).toContain('THU');
  });

  it('exposes the study data reset action', () => {
    const markup = renderToStaticMarkup(<SettingsView data={data} onEvent={onEvent} onReset={onEvent} />);

    expect(markup).toContain('Reset study data');
  });
});

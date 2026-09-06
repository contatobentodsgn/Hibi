import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createSeedData } from '../../data/seed-data';
import { DayView } from '../DayView';
import { RemindersView } from '../RemindersView';
import { SettingsView } from '../SettingsView';
import { TasksView } from '../TasksView';
import { WeekView } from '../WeekView';
import { HabitsView } from '../HabitsView';
import { GoalsView } from '../GoalsView';
import { AppShell } from '../AppShell';
import { CommandPalette } from '../CommandPalette';
import { FocusView } from '../FocusView';

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

  it('exposes settings sections for study data and notifications', () => {
    const markup = renderToStaticMarkup(<SettingsView data={data} onEvent={onEvent} onReset={onEvent} />);

    expect(markup).toContain('>Notifications</button>');
    expect(markup).toContain('>Data</button>');
  });

  it('renders the empty habits workspace with a create action', () => {
    const markup = renderToStaticMarkup(<HabitsView data={data} onCreate={onEvent} onToggleCompletion={onEvent} onUpdate={onEvent} onDelete={onEvent} />);

    expect(markup).toContain('Habits');
    expect(markup).toContain('No habits yet');
    expect(markup).toContain('New habit');
  });

  it('renders the empty goals workspace with a create action', () => {
    const markup = renderToStaticMarkup(<GoalsView data={data} onCreate={onEvent} onProgress={onEvent} onUpdate={onEvent} onDelete={onEvent} />);

    expect(markup).toContain('Goals');
    expect(markup).toContain('No goals yet');
    expect(markup).toContain('New goal');
  });

  it('exposes habits and goals through primary navigation and commands', () => {
    const shell = renderToStaticMarkup(<AppShell active="home" taskCount={0} reminderCount={0} onNavigate={onEvent} onOpenCommands={onEvent}>content</AppShell>);
    const palette = renderToStaticMarkup(<CommandPalette onClose={onEvent} onNavigate={onEvent} onEvent={onEvent} />);

    expect(shell).toContain('aria-label="Habits"');
    expect(shell).toContain('aria-label="Goals"');
    expect(palette).toContain('Track habits');
    expect(palette).toContain('Review goals');
  });

  it('exposes selectable focus and break durations', () => {
    const markup = renderToStaticMarkup(<FocusView onEvent={onEvent} />);
    expect(markup).toContain('25m focus');
    expect(markup).toContain('5m break');
    expect(markup).toContain('15m break');
  });
});

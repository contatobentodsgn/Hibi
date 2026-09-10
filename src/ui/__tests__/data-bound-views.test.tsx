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
import { DockMoreMenu } from '../shell/Dock';
import { CommandPalette } from '../palette/CommandPalette';
import type { AssistantTurnControls } from '../useAssistantTurn';
import { FocusView } from '../FocusView';
import { HelpView } from '../HelpView';

const data = createSeedData();
const onEvent = () => undefined;
const idleTurn: AssistantTurnControls = { state: { status: 'idle' }, ask: async () => undefined, confirm: async () => undefined, cancelConfirmation: async () => undefined, stop: onEvent, retry: async () => undefined, useLocalFallback: async () => undefined, dismiss: () => 'close', reset: onEvent };

describe('study views', () => {
  it('renders tasks from the study snapshot', () => {
    const markup = renderToStaticMarkup(
      <TasksView data={data} onEvent={onEvent} onTaskStatusChange={onEvent} />,
    );

    expect(markup).toContain('Kabrito Post 01');
    expect(markup).toContain('Marina Post 02');
    expect(markup).toContain('8 open');
  });

  it('renders accessible task creation and editing controls without prompt actions', () => {
    const markup = renderToStaticMarkup(
      <TasksView
        data={data}
        onEvent={onEvent}
        onTaskStatusChange={onEvent}
        onCreateTask={() => undefined}
        onRenameTask={() => undefined}
        onDeleteTask={() => undefined}
        onEditTaskDeadline={() => undefined}
      />,
    );

    expect(markup).toContain('aria-label="New task title"');
    expect(markup).toContain('Add task');
    expect(markup).toContain('aria-label="Rename Kabrito Post 01"');
    expect(markup).toContain('aria-label="Set deadline for Kabrito Post 01"');
    expect(markup).toContain('aria-label="Delete Kabrito Post 01"');
    expect(markup).not.toContain('window.prompt');
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

  it('gives day event controls descriptive delete labels', () => {
    const markup = renderToStaticMarkup(
      <DayView data={data} onEvent={onEvent} onCreateBlock={onEvent} onDeleteBlock={onEvent} />,
    );

    expect(markup).toContain('aria-label="Delete Kabrito Post 01 at 09:00"');
    expect(markup).not.toContain('aria-label="Delete Kabrito Post 01"');
  });

  it('gives week event controls descriptive delete labels and add slots button semantics', () => {
    const markup = renderToStaticMarkup(
      <WeekView data={data} onEvent={onEvent} onCreateBlock={onEvent} onDeleteBlock={onEvent} />,
    );

    expect(markup).toContain('aria-label="Delete Aula de inglês at 08:00 on 2026-09-10"');
    expect(markup).toContain('role="button"');
    expect(markup).toContain('tabindex="0"');
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
    expect(markup).toContain('aria-label="Create habit"');
    expect(markup).toContain('aria-label="New habit title"');
    expect(markup).not.toContain('window.prompt');
  });

  it('renders the empty goals workspace with a create action', () => {
    const markup = renderToStaticMarkup(<GoalsView data={data} onCreate={onEvent} onProgress={onEvent} onUpdate={onEvent} onDelete={onEvent} />);

    expect(markup).toContain('Goals');
    expect(markup).toContain('No goals yet');
    expect(markup).toContain('New goal');
  });

  it('renders accessible goal creation, progress, and editing forms', () => {
    const goalData = { ...data, goals: [{ id: 'goal-1', title: 'Read books', target: 10, current: 2, unit: 'books' }] };
    const markup = renderToStaticMarkup(<GoalsView data={goalData} onCreate={onEvent} onProgress={onEvent} onUpdate={onEvent} onDelete={onEvent} />);

    expect(markup).toContain('aria-label="Create goal"');
    expect(markup).toContain('aria-label="Set progress for Read books"');
    expect(markup).toContain('aria-label="Edit Read books"');
    expect(markup).toContain('name="target"');
    expect(markup).not.toContain('window.prompt');
  });

  it('exposes habits and goals through the dock menu and commands', () => {
    const menu = renderToStaticMarkup(<DockMoreMenu active="home" onSelect={onEvent} />);
    const palette = renderToStaticMarkup(<CommandPalette onClose={onEvent} onNavigate={onEvent} onEvent={onEvent} turn={idleTurn} />);

    expect(menu).toContain('Hábitos');
    expect(menu).toContain('Metas');
    expect(palette).toContain('Acompanhar hábitos');
    expect(palette).toContain('Revisar metas');
  });

  it('exposes selectable focus and break durations', () => {
    const markup = renderToStaticMarkup(<FocusView onEvent={onEvent} />);
    expect(markup).toContain('25m focus');
    expect(markup).toContain('5m break');
    expect(markup).toContain('15m break');
  });

  it('lists the release and hardware surfaces in Help', () => {
    const markup = renderToStaticMarkup(<HelpView onNavigate={onEvent} />);
    expect(markup).toContain('/updates');
    expect(markup).toContain('/hardware');
  });
});

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createSeedData } from '../../data/seed-data';
import type { StudyData } from '../../domain/models';
import { DayView } from '../DayView';
import { HomeView } from '../HomeView';
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
import { TasksAtelierSummary } from '../TasksAtelierSummary';

const data = createSeedData();
const onEvent = () => undefined;

// O seed já nasce ancorado em hoje e nos quatro dias seguintes (ver `data/seed-data`), e Início, Dia
// e Semana abrem na data local real — então a agenda do seed já é a destes testes, sem remapear
// nada. Tudo é montado com os componentes locais da data, para valer em qualquer fuso.
const pad = (value: number) => String(value).padStart(2, '0');
const dayFromToday = (offset: number) => { const date = new Date(); date.setDate(date.getDate() + offset); return date; };
const keyFromToday = (offset: number) => { const date = dayFromToday(offset); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; };
const agenda = data;
// Um workspace só com blocos antigos: "hoje" não pode escorregar para a data do bloco mais antigo.
const oldWorkspace: StudyData = { ...data, blocks: [{ id: 'antigo', title: 'Bloco antigo', start: '2020-01-02T09:00:00', end: '2020-01-02T10:00:00', category: 'work' }] };
const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const dayLabel = (offset: number) => { const date = dayFromToday(offset); return `${WEEKDAYS[date.getDay()]} · ${pad(date.getDate())} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`; };
const homeLabel = (offset: number) => { const date = dayFromToday(offset); return `${WEEKDAYS[date.getDay()]} · ${MONTHS[date.getMonth()]} ${pad(date.getDate())}, ${date.getFullYear()}`; };
const shortLabel = (offset: number) => { const date = dayFromToday(offset); return `${SHORT_DAYS[date.getDay()]} ${pad(date.getDate())}`; };
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

  it('mounts the task summary and exposes a textual deadline state per open task', () => {
    const markup = renderToStaticMarkup(<TasksView data={data} onEvent={onEvent} onTaskStatusChange={onEvent} />);

    expect(markup).toContain('Task execution summary');
    expect(markup).toContain('data-deadline-state=');
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

  it('renders a named task execution summary with deadline states in text', () => {
    const markup = renderToStaticMarkup(<TasksAtelierSummary tasks={data.tasks} today={keyFromToday(0)} />);

    expect(markup).toContain('aria-label="Task execution summary"');
    expect(markup).toContain('Next action');
    expect(markup).toContain('Overdue');
    expect(markup).toContain('Due today');
    expect(markup).toContain('Without deadline');
  });

  it('renders reminders from the study snapshot', () => {
    const markup = renderToStaticMarkup(
      <RemindersView data={data} onEvent={onEvent} onReminderStatusChange={onEvent} />,
    );

    expect(markup).toContain('vaga/inglês - Horizontes');
    expect(markup).toContain('Tue 09:00 · Wed 20:00');
    expect(markup).toContain('1 active');
  });

  it('opens the day on the real local date and renders its blocks', () => {
    const markup = renderToStaticMarkup(
      <DayView data={agenda} onEvent={onEvent} onCreateBlock={onEvent} />,
    );

    expect(markup).toContain(dayLabel(0));
    expect(markup).toContain('Kabrito Post 01');
    expect(markup).toContain('Almoço');
  });

  it('opens the week on the real local date and renders its blocks', () => {
    const markup = renderToStaticMarkup(
      <WeekView data={agenda} onEvent={onEvent} onCreateBlock={onEvent} />,
    );

    expect(markup).toContain(`${shortLabel(0)} — ${shortLabel(6)}`);
    expect(markup).toContain('Aula de inglês');
    expect(markup).toContain('THU');
  });

  // A data do bloco mais antigo do workspace não é "hoje": um workspace só com blocos velhos
  // continua abrindo no dia de hoje, vazio, em vez de voltar no tempo.
  it('keeps Day, Week and Home on today when the workspace only has old blocks', () => {
    const day = renderToStaticMarkup(<DayView data={oldWorkspace} onEvent={onEvent} onCreateBlock={onEvent} />);
    const week = renderToStaticMarkup(<WeekView data={oldWorkspace} onEvent={onEvent} onCreateBlock={onEvent} />);
    const home = renderToStaticMarkup(<HomeView data={oldWorkspace} onEvent={onEvent} onNavigate={onEvent} />);

    expect(day).toContain(dayLabel(0));
    expect(week).toContain(`${shortLabel(0)} — ${shortLabel(6)}`);
    expect(home).toContain(homeLabel(0));
    for (const markup of [day, week, home]) expect(markup).not.toContain('Bloco antigo');
    expect(home).toContain('No block scheduled');
  });

  it('shows the blocks of the real local day on Home', () => {
    const markup = renderToStaticMarkup(<HomeView data={agenda} onEvent={onEvent} onNavigate={onEvent} />);

    expect(markup).toContain(homeLabel(0));
    expect(markup).toContain('Kabrito Post 01');
    expect(markup).toContain('8 work blocks planned today');
  });

  it('gives day event controls descriptive delete labels', () => {
    const markup = renderToStaticMarkup(
      <DayView data={agenda} onEvent={onEvent} onCreateBlock={onEvent} onDeleteBlock={onEvent} />,
    );

    expect(markup).toContain('aria-label="Delete Kabrito Post 01 at 09:00"');
    expect(markup).not.toContain('aria-label="Delete Kabrito Post 01"');
  });

  it('gives week event controls descriptive delete labels and add slots button semantics', () => {
    const markup = renderToStaticMarkup(
      <WeekView data={agenda} onEvent={onEvent} onCreateBlock={onEvent} onDeleteBlock={onEvent} />,
    );

    expect(markup).toContain(`aria-label="Delete Aula de inglês at 08:00 on ${keyFromToday(3)}"`);
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
    const palette = renderToStaticMarkup(<CommandPalette data={data} onClose={onEvent} onNavigate={onEvent} onEvent={onEvent} onRenameFolder={() => ({ ok: false, reason: 'missing' } as const)} turn={idleTurn} conversations={{ conversations: [], activeId: null, query: '', saveFailed: false, record: onEvent, select: onEvent, create: onEvent, remove: onEvent, removeAll: onEvent, search: onEvent }} />);

    expect(menu).toContain('Hábitos');
    expect(menu).toContain('Metas');
    expect(palette).toContain('Acompanhar hábitos');
    expect(palette).toContain('Revisar metas');
  });

  it('separates focus and break durations', () => {
    const focus = renderToStaticMarkup(<FocusView onEvent={onEvent} />);
    expect(focus).toContain('25m focus');
    expect(focus).not.toContain('5m break');
    expect(focus).toContain('Fazer uma pausa');
    // A frase só permanece na tela porque o portão em electron/focus-gate.mjs a cumpre.
    expect(focus).toContain('ficam quietos durante o foco');

    const pause = renderToStaticMarkup(<FocusView onEvent={onEvent} mode="break" />);
    expect(pause).toContain('PAUSA · SESSÃO LOCAL');
    expect(pause).toContain('>5m</button>');
    expect(pause).toContain('>15m</button>');
    expect(pause).toContain('5 min de pausa no relógio.');
    expect(pause).toContain('Voltar ao foco');
    expect(pause).not.toContain('ficam quietos durante o foco');
  });

  it('lists the release and hardware surfaces in Help', () => {
    const markup = renderToStaticMarkup(<HelpView onNavigate={onEvent} />);
    expect(markup).toContain('/updates');
    expect(markup).toContain('/hardware');
    expect(markup).toContain('/break');
  });

  it('lists /stats in Help', () => {
    const markup = renderToStaticMarkup(<HelpView onNavigate={onEvent} />);
    expect(markup).toContain('/stats');
  });
});

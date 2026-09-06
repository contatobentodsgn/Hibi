import React, { useMemo, useState } from 'react';
import { LocalRepository } from './data/local-repository';
import { createSeedData } from './data/seed-data';
import type { EntityStatus, Goal, Habit, ScheduleBlock, StudyData } from './domain/models';
import { validateScheduleBlock } from './domain/conflicts';
import { AppShell, NavKey } from './ui/AppShell';
import { CommandPalette } from './ui/CommandPalette';
import { HomeView } from './ui/HomeView';
import { TasksView } from './ui/TasksView';
import { RemindersView, type EditedReminderSchedule } from './ui/RemindersView';
import { DayView } from './ui/DayView';
import { WeekView } from './ui/WeekView';
import { FocusView } from './ui/FocusView';
import { SettingsView } from './ui/SettingsView';
import { InstrumentationView } from './ui/InstrumentationView';
import { NotesView } from './ui/NotesView';
import { buildNotificationEntries } from './domain/notifications';
import { HabitsView } from './ui/HabitsView';
import { GoalsView } from './ui/GoalsView';
import { ReviewView } from './ui/ReviewView';
import { TabyView } from './ui/TabyView';
import { HelpView } from './ui/HelpView';
import { FeedbackView } from './ui/FeedbackView';
import { AvailabilityView } from './ui/AvailabilityView';
import { firstWeeklyOccurrence } from './domain/recurrence';
import { TaskCreateModal, type NewTaskForm } from './ui/TaskCreateModal';
import { ReminderCreateModal, type NewReminderForm } from './ui/ReminderCreateModal';

export type EventRecord = { id: number; at: string; route: string; action: string; detail: string; result?: string };

const initialEvents: EventRecord[] = [
  { id: 1, at: '09:02:14', route: 'week', action: 'navigation', detail: 'Opened weekly schedule' },
  { id: 2, at: '09:03:01', route: 'week', action: 'validation', detail: 'Checked 8 schedule blocks', result: 'pass' },
  { id: 3, at: '09:04:22', route: 'reminders', action: 'edit', detail: 'Horizontes recurrence preview', result: 'pending' },
];

export default function App() {
  const [repository] = useState(() => {
    const seed = createSeedData();
    try { const saved = window.localStorage.getItem('hibi-study-data'); return saved ? LocalRepository.fromJson(seed, saved) : new LocalRepository(seed); } catch { return new LocalRepository(seed); }
  });
  const [data, setData] = useState<StudyData>(() => repository.snapshot());
  const [route, setRoute] = useState<NavKey>('home');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [taskCreateOpen, setTaskCreateOpen] = useState(false);
  const [reminderCreateOpen, setReminderCreateOpen] = useState(false);
  const [events, setEvents] = useState<EventRecord[]>(() => { try { const saved = window.localStorage.getItem('hibi-events'); return saved ? JSON.parse(saved) as EventRecord[] : initialEvents; } catch { return initialEvents; } });
  const clearEvents = () => setEvents([]);

  const log = (action: string, detail: string, result?: string) => {
    setEvents((current) => [{ id: Math.max(0, ...current.map((event) => event.id)) + 1, at: new Date().toLocaleTimeString('pt-BR'), route, action, detail, result }, ...current]);
  };

  const refreshData = () => setData(repository.snapshot());
  const planStartDate = () => repository.listBlocks().map((block) => block.start.slice(0, 10)).filter(Boolean).sort()[0] ?? new Date().toISOString().slice(0, 10);

  const changeTaskStatus = (id: string, status: EntityStatus) => {
    const task = repository.getTask(id);
    if (!task) return;
    repository.updateTask(id, { status });
    refreshData();
    log(status === 'completed' ? 'complete' : 'reopen', task.title, status);
  };

  const changeReminderStatus = (id: string, status: EntityStatus) => {
    const reminder = data.reminders.find((item) => item.id === id);
    if (!reminder) return;
    repository.updateReminder(id, { status });
    refreshData();
    log(status === 'paused' ? 'pause' : 'resume', reminder.title, status);
  };

  const createBlock = (input: Omit<ScheduleBlock, 'id'>) => {
    const validation = validateScheduleBlock({ ...input, id: `preview-${Date.now()}` }, repository.listBlocks());
    if (!validation.valid) { window.alert(validation.errors.join('\n')); log('validation', input.title, 'blocked'); return; }
    repository.createBlock(input);
    refreshData();
    log('create', input.title);
  };
  const deleteBlock = (id: string) => { const block = data.blocks.find((item) => item.id === id); if (!block) return; if (!window.confirm(`Excluir ${block.title}?`)) return; repository.deleteBlock(id); refreshData(); log('delete', block.title); };
  const createTask = ({ title, durationMinutes, folder }: NewTaskForm) => { repository.createTask({ title, durationMinutes, category: 'work', folder, status: 'open' }); refreshData(); log('create', title); setTaskCreateOpen(false); };
  const createReminder = ({ title, category, date, frequency, time, weekdays }: NewReminderForm) => {
    if (frequency === 'one-time') repository.createReminder({ title, category, status: 'open', schedule: { at: `${date}T${time}:00-03:00` } });
    if (frequency === 'daily') repository.createReminder({ title, category, status: 'open', schedule: { at: `${date}T${time}:00-03:00`, recurrence: { frequency: 'daily', time, startDate: date } } });
    if (frequency === 'weekly') {
      const parts = weekdays.map((day) => `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]} ${time}`);
      const first = firstWeeklyOccurrence(date, parts)!;
      repository.createReminder({ title, category, status: 'open', schedule: { at: `${first.date}T${first.time}:00-03:00`, recurrence: { frequency: 'weekly', weekdays, timesByWeekday: Object.fromEntries(weekdays.map((day) => [day, time])), startDate: date } } });
    }
    refreshData(); log('create', title); setReminderCreateOpen(false);
  };
  const renameTask = (id: string, title: string) => { repository.updateTask(id, { title }); refreshData(); log('edit', title); };
  const renameReminder = (id: string, title: string) => { repository.updateReminder(id, { title }); refreshData(); log('edit', title); };
  const deleteTask = (id: string) => { repository.deleteTask(id); refreshData(); log('delete', id); };
  const deleteReminder = (id: string) => { repository.deleteReminder(id); refreshData(); log('delete', id); };
  const createNote = (title: string, content: string) => { repository.createNote({ title, content, folder: 'Bento', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); refreshData(); log('create', title); };
  const updateNote = (id: string, changes: Partial<import('./domain/models').Note>) => { repository.updateNote(id, changes); refreshData(); log('edit', id); };
  const deleteNote = (id: string) => { repository.deleteNote(id); refreshData(); log('delete', id); };
  const submitFeedback = (kind: string, text: string) => { repository.createNote({ title: `[${kind}] Feedback`, content: text, folder: 'Bento', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); refreshData(); log('feedback', kind, 'saved-local'); };
  const createHabit = (title: string, frequency: Habit['frequency'] = 'daily', targetPerWeek = 7) => { repository.createHabit({ title, frequency, targetPerWeek, completedDates: [], status: 'open' }); refreshData(); log('create', title); };
  const updateHabit = (id: string, changes: Partial<Omit<Habit, 'id'>>) => { repository.updateHabit(id, changes); refreshData(); log('edit', id); };
  const deleteHabit = (id: string) => { repository.deleteHabit(id); refreshData(); log('delete', id); };
  const toggleHabitCompletion = (id: string, date: string, completed: boolean) => { repository.setHabitCompletion(id, date, completed); refreshData(); log(completed ? 'complete' : 'reopen', id, date); };
  const createGoal = (title: string, target: number, unit?: string) => { repository.createGoal({ title, target, current: 0, unit, status: 'open' }); refreshData(); log('create', title); };
  const updateGoal = (id: string, changes: Partial<Omit<Goal, 'id'>>) => { repository.updateGoal(id, changes); refreshData(); log('edit', id); };
  const deleteGoal = (id: string) => { repository.deleteGoal(id); refreshData(); log('delete', id); };
  const setGoalProgress = (id: string, current: number) => { repository.setGoalProgress(id, current); refreshData(); log('progress', id, String(current)); };
  const editTaskDeadline = (id: string) => { const task = data.tasks.find((item) => item.id === id); if (!task) return; const value = window.prompt('Deadline (AAAA-MM-DD HH:MM), vazio remove', task.deadline ? task.deadline.replace('T', ' ') : ''); if (value === null) return; const trimmed = value.trim(); if (trimmed && !/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/.test(trimmed)) { window.alert('Formato inválido.'); return; } repository.updateTask(id, { deadline: trimmed ? trimmed.replace(' ', 'T') : undefined }); refreshData(); log('edit', task.title, 'deadline-updated'); };
  const editReminderSchedule = (id: string, edited: EditedReminderSchedule) => {
    const reminder = data.reminders.find((item) => item.id === id); if (!reminder) return;
    if (edited.frequency === 'one-time') repository.updateReminder(id, { schedule: { at: `${edited.date}T${edited.time}:00-03:00` } });
    if (edited.frequency === 'daily') repository.updateReminder(id, { schedule: { at: `${edited.date}T${edited.time}:00-03:00`, recurrence: { frequency: 'daily', time: edited.time, startDate: edited.date } } });
    if (edited.frequency === 'weekly') {
      const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const parts = edited.weekdays.map((day) => `${labels[day]} ${edited.time}`);
      const first = firstWeeklyOccurrence(edited.date, parts)!;
      const timesByWeekday: Record<number, string> = Object.fromEntries(edited.weekdays.map((day) => [day, edited.time]));
      repository.updateReminder(id, { schedule: { at: `${first.date}T${first.time}:00-03:00`, recurrence: { frequency: 'weekly', weekdays: edited.weekdays, timesByWeekday, startDate: edited.date } } });
    }
    refreshData(); log('edit', reminder.title, 'schedule-updated');
  };

  const resetStudyData = () => {
    if (!window.confirm('Reset all local study data?')) return;
    repository.reset();
    refreshData();
  };

  const testNativeNotification = async () => {
    const shown = await window.hibiDesktop?.showTestNotification?.();
    return shown ?? false;
  };

  React.useEffect(() => { window.localStorage.setItem('hibi-study-data', repository.exportJson()); }, [repository, data]);
  React.useEffect(() => { window.localStorage.setItem('hibi-events', JSON.stringify(events)); }, [events]);
  React.useEffect(() => {
    const syncNotifications = window.hibiDesktop?.syncNotifications;
    if (syncNotifications) void syncNotifications(buildNotificationEntries(data)).catch(() => undefined);
  }, [data]);
  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPaletteOpen(true); }
      else if (event.key === '/' && !typing) { event.preventDefault(); setPaletteOpen(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const navigate = (next: NavKey, source = 'navigation') => {
    setRoute(next);
    log(source, `Opened ${next}`);
  };

  const content = useMemo(() => {
    const props = { onEvent: log, onNavigate: navigate };
    switch (route) {
      case 'tasks': return <TasksView {...props} data={data} onTaskStatusChange={changeTaskStatus} onCreateTask={() => undefined} onRenameTask={renameTask} onDeleteTask={deleteTask} onEditTaskDeadline={editTaskDeadline} />;
      case 'notes': return <NotesView data={data} onCreate={createNote} onUpdate={updateNote} onDelete={deleteNote} />;
      case 'reminders': return <RemindersView {...props} data={data} onReminderStatusChange={changeReminderStatus} onCreateReminder={() => setReminderCreateOpen(true)} onRenameReminder={renameReminder} onDeleteReminder={deleteReminder} onEditReminderSchedule={editReminderSchedule} />;
      case 'habits': return <HabitsView data={data} onCreate={createHabit} onToggleCompletion={toggleHabitCompletion} onUpdate={updateHabit} onDelete={deleteHabit} />;
      case 'goals': return <GoalsView data={data} onCreate={createGoal} onProgress={setGoalProgress} onUpdate={updateGoal} onDelete={deleteGoal} />;
      case 'review': return <ReviewView data={data} onNavigate={navigate} />;
      case 'taby': return <TabyView data={data} onEvent={log} />;
      case 'help': return <HelpView onNavigate={navigate} />;
      case 'feedback': return <FeedbackView onSubmit={submitFeedback} />;
      case 'day': return <DayView {...props} data={data} onCreateBlock={createBlock} onDeleteBlock={deleteBlock} />;
      case 'week': return <WeekView {...props} data={data} onCreateBlock={createBlock} onDeleteBlock={deleteBlock} />;
      case 'focus': return <FocusView {...props} />;
      case 'settings': return <SettingsView {...props} data={data} onReset={resetStudyData} onTestNotification={testNativeNotification} />;
      case 'instrumentation': return <InstrumentationView events={events} onEvent={log} onClear={clearEvents} />;
      case 'updates': return <AvailabilityView kind="updates" onNavigate={navigate} />;
      case 'hardware': return <AvailabilityView kind="hardware" onNavigate={navigate} />;
      default: return <HomeView {...props} data={data} onOpenCommands={() => setPaletteOpen(true)} />;
    }
  }, [route, events, data]);

  return (
    <AppShell active={route} taskCount={data.tasks.filter((task) => task.status !== 'completed' && task.status !== 'paused').length} reminderCount={data.reminders.filter((reminder) => reminder.status !== 'paused').length} habitCount={data.habits.filter((habit) => habit.status !== 'completed' && habit.status !== 'paused').length} goalCount={data.goals.filter((goal) => goal.status !== 'completed' && goal.status !== 'paused').length} onNavigate={navigate} onOpenCommands={() => setPaletteOpen(true)}>
      <div onClickCapture={(event) => { const button = (event.target as HTMLElement).closest('button'); if (route === 'tasks' && button?.textContent?.trim() === '+ New task') { event.preventDefault(); event.stopPropagation(); setTaskCreateOpen(true); } if (route === 'reminders' && button?.textContent?.trim() === '+ New reminder') { event.preventDefault(); event.stopPropagation(); setReminderCreateOpen(true); } }}>{content}</div>
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} onNavigate={(next) => { setPaletteOpen(false); navigate(next, 'command'); }} onEvent={log} />}
      {taskCreateOpen && <TaskCreateModal onClose={() => setTaskCreateOpen(false)} onSubmit={createTask} />}
      {reminderCreateOpen && <ReminderCreateModal defaultDate={planStartDate()} onClose={() => setReminderCreateOpen(false)} onSubmit={createReminder} />}
    </AppShell>
  );
}

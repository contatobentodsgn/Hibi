import React, { useMemo, useState } from 'react';
import { LocalRepository } from './data/local-repository';
import { createSeedData } from './data/seed-data';
import type { EntityStatus, ScheduleBlock, StudyData } from './domain/models';
import { validateScheduleBlock } from './domain/conflicts';
import { AppShell, NavKey } from './ui/AppShell';
import { CommandPalette } from './ui/CommandPalette';
import { HomeView } from './ui/HomeView';
import { TasksView } from './ui/TasksView';
import { RemindersView } from './ui/RemindersView';
import { DayView } from './ui/DayView';
import { WeekView } from './ui/WeekView';
import { FocusView } from './ui/FocusView';
import { SettingsView } from './ui/SettingsView';
import { InstrumentationView } from './ui/InstrumentationView';

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
  const [events, setEvents] = useState<EventRecord[]>(initialEvents);

  const log = (action: string, detail: string, result?: string) => {
    setEvents((current) => [{ id: Date.now(), at: new Date().toLocaleTimeString('pt-BR'), route, action, detail, result }, ...current]);
  };

  const refreshData = () => setData(repository.snapshot());

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
  const createTask = (title: string) => { const deadline = window.prompt('Deadline (AAAA-MM-DD HH:MM), ou deixe vazio'); repository.createTask({ title, durationMinutes: 60, category: 'work', folder: 'Bento', status: 'open', deadline: deadline?.trim() || undefined }); refreshData(); log('create', title); };
  const createReminder = (title: string) => { repository.createReminder({ title, category: 'important', status: 'open', schedule: { at: new Date().toISOString() } }); refreshData(); log('create', title); };
  const renameTask = (id: string, title: string) => { repository.updateTask(id, { title }); refreshData(); log('edit', title); };
  const renameReminder = (id: string, title: string) => { repository.updateReminder(id, { title }); refreshData(); log('edit', title); };
  const deleteTask = (id: string) => { repository.deleteTask(id); refreshData(); log('delete', id); };
  const deleteReminder = (id: string) => { repository.deleteReminder(id); refreshData(); log('delete', id); };

  const resetStudyData = () => {
    repository.reset();
    refreshData();
  };

  React.useEffect(() => { window.localStorage.setItem('hibi-study-data', repository.exportJson()); }, [repository, data]);
  React.useEffect(() => { const handler = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPaletteOpen(true); } }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler); }, []);

  const navigate = (next: NavKey, source = 'navigation') => {
    setRoute(next);
    log(source, `Opened ${next}`);
  };

  const content = useMemo(() => {
    const props = { onEvent: log, onNavigate: navigate };
    switch (route) {
      case 'tasks': return <TasksView {...props} data={data} onTaskStatusChange={changeTaskStatus} onCreateTask={createTask} onRenameTask={renameTask} onDeleteTask={deleteTask} />;
      case 'reminders': return <RemindersView {...props} data={data} onReminderStatusChange={changeReminderStatus} onCreateReminder={createReminder} onRenameReminder={renameReminder} onDeleteReminder={deleteReminder} />;
      case 'day': return <DayView {...props} data={data} onCreateBlock={createBlock} />;
      case 'week': return <WeekView {...props} data={data} onCreateBlock={createBlock} />;
      case 'focus': return <FocusView {...props} />;
      case 'settings': return <SettingsView {...props} data={data} onReset={resetStudyData} />;
      case 'instrumentation': return <InstrumentationView events={events} onEvent={log} />;
      default: return <HomeView {...props} />;
    }
  }, [route, events, data]);

  return (
    <AppShell active={route} taskCount={data.tasks.filter((task) => task.status !== 'completed' && task.status !== 'paused').length} reminderCount={data.reminders.filter((reminder) => reminder.status !== 'paused').length} onNavigate={navigate} onOpenCommands={() => setPaletteOpen(true)}>
      {content}
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} onNavigate={(next) => { setPaletteOpen(false); navigate(next, 'command'); }} onEvent={log} />}
    </AppShell>
  );
}

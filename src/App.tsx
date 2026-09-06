import React, { useMemo, useState } from 'react';
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
  const [route, setRoute] = useState<NavKey>('home');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [events, setEvents] = useState<EventRecord[]>(initialEvents);

  const log = (action: string, detail: string, result?: string) => {
    setEvents((current) => [{ id: Date.now(), at: new Date().toLocaleTimeString('pt-BR'), route, action, detail, result }, ...current]);
  };

  const navigate = (next: NavKey, source = 'navigation') => {
    setRoute(next);
    log(source, `Opened ${next}`);
  };

  const content = useMemo(() => {
    const props = { onEvent: log, onNavigate: navigate };
    switch (route) {
      case 'tasks': return <TasksView {...props} />;
      case 'reminders': return <RemindersView {...props} />;
      case 'day': return <DayView {...props} />;
      case 'week': return <WeekView {...props} />;
      case 'focus': return <FocusView {...props} />;
      case 'settings': return <SettingsView {...props} />;
      case 'instrumentation': return <InstrumentationView events={events} onEvent={log} />;
      default: return <HomeView {...props} />;
    }
  }, [route, events]);

  return (
    <AppShell active={route} onNavigate={navigate} onOpenCommands={() => setPaletteOpen(true)}>
      {content}
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} onNavigate={(next) => { setPaletteOpen(false); navigate(next, 'command'); }} onEvent={log} />}
    </AppShell>
  );
}

import React from 'react';

export type NavKey = 'home' | 'tasks' | 'reminders' | 'day' | 'week' | 'focus' | 'settings' | 'instrumentation';
type Props = { active: NavKey; onNavigate: (key: NavKey) => void; onOpenCommands: () => void; children: React.ReactNode };

const items: { key: NavKey; label: string; icon: string }[] = [
  { key: 'tasks', label: 'Tasks', icon: '☷' }, { key: 'reminders', label: 'Reminders', icon: '♢' },
  { key: 'day', label: 'Day', icon: '□' }, { key: 'week', label: 'Week', icon: '▦' },
  { key: 'focus', label: 'Focus', icon: '◉' }, { key: 'settings', label: 'Settings', icon: '⚙' },
  { key: 'instrumentation', label: 'Events', icon: '⌁' },
];

export function AppShell({ active, onNavigate, onOpenCommands, children }: Props) {
  return <div className="app-frame">
    <header className="topbar">
      <button className="brand" onClick={() => onNavigate('home')} aria-label="Open Hibi home"><span className="brand-mark">h</span><span>HIBI <small>STUDY REPLICA</small></span></button>
      <nav className="top-nav" aria-label="Primary navigation">
        <button className="home-link" onClick={() => onNavigate('home')} data-active={active === 'home'}>Home</button>
        {items.map((item) => <button key={item.key} className="nav-icon" title={item.label} aria-label={item.label} data-active={active === item.key} onClick={() => onNavigate(item.key)}><span>{item.icon}</span><small>{item.key === 'tasks' ? '7' : item.key === 'reminders' ? '3' : ''}</small></button>)}
      </nav>
      <button className="command-hint" onClick={onOpenCommands}><kbd>/</kbd><span>commands</span><kbd>⌘K</kbd></button>
    </header>
    <main className="content">{children}</main>
    <footer className="statusbar"><span><i className="live-dot" /> Local study data</span><span>Hibi Study Replica · no sync</span></footer>
  </div>;
}

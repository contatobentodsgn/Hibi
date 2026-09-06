import React, { useEffect, useState } from 'react';
import { NavKey } from './AppShell';
type Props = { onClose: () => void; onNavigate: (key: NavKey) => void; onEvent: (action: string, detail: string) => void };
const commands: { key: string; label: string; group: string; route?: NavKey }[] = [
  { key: '/day', label: 'Open today schedule', group: 'Navigate', route: 'day' }, { key: '/week', label: 'Open weekly schedule', group: 'Navigate', route: 'week' },
  { key: '/tasks', label: 'Browse tasks', group: 'Navigate', route: 'tasks' }, { key: '/reminders', label: 'Browse reminders', group: 'Navigate', route: 'reminders' }, { key: '/habits', label: 'Track habits', group: 'Navigate', route: 'habits' }, { key: '/goals', label: 'Review goals', group: 'Navigate', route: 'goals' },
  { key: '/notes', label: 'Browse notes', group: 'Navigate', route: 'notes' },
  { key: '/review', label: 'Review workspace', group: 'Navigate', route: 'review' },
  { key: '/focus', label: 'Start a focus session', group: 'Work', route: 'focus' }, { key: '/settings', label: 'Open settings', group: 'System', route: 'settings' },
  { key: '/events', label: 'Inspect instrumentation', group: 'System', route: 'instrumentation' },
];
export function CommandPalette({ onClose, onNavigate, onEvent }: Props) {
  const [query, setQuery] = useState('');
  const matches = commands.filter((item) => `${item.key} ${item.label}`.toLowerCase().includes(query.toLowerCase()));
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onClose]);
  return <div className="overlay" onMouseDown={onClose}><section className="palette" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-label="Command palette">
    <div className="palette-search"><span>/</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type a command" /></div>
    {matches.map((item) => <button className="command-row" key={item.key} onClick={() => { onEvent('command', item.key); if (item.route) onNavigate(item.route); }}><kbd>{item.key}</kbd><span>{item.label}</span><small>{item.group}</small></button>)}
    {!matches.length && <p className="empty">No command found. Try /week or /focus.</p>}
    <div className="palette-footer"><span>↑↓ select</span><span>↵ open</span><span>esc close</span></div>
  </section></div>;
}

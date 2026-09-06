import React, { useEffect, useRef, useState } from 'react';
import { NavKey } from './AppShell';
type Props = { onClose: () => void; onNavigate: (key: NavKey) => void; onEvent: (action: string, detail: string) => void };
const commands: { key: string; label: string; group: string; route?: NavKey }[] = [
  { key: '/day', label: 'Open today schedule', group: 'Navigate', route: 'day' }, { key: '/week', label: 'Open weekly schedule', group: 'Navigate', route: 'week' },
  { key: '/tasks', label: 'Browse tasks', group: 'Navigate', route: 'tasks' }, { key: '/reminders', label: 'Browse reminders', group: 'Navigate', route: 'reminders' }, { key: '/habits', label: 'Track habits', group: 'Navigate', route: 'habits' }, { key: '/goals', label: 'Review goals', group: 'Navigate', route: 'goals' },
  { key: '/notes', label: 'Browse notes', group: 'Navigate', route: 'notes' },
  { key: '/review', label: 'Review workspace', group: 'Navigate', route: 'review' },
  { key: '/stats', label: 'Open workspace statistics', group: 'Navigate', route: 'review' },
  { key: '/taby', label: 'Open local assistant', group: 'Navigate', route: 'taby' },
  { key: '/help', label: 'Show all available commands', group: 'System', route: 'help' },
  { key: '/feedback', label: 'Save feedback locally', group: 'System', route: 'feedback' },
  { key: '/bug', label: 'Report a bug locally', group: 'System', route: 'feedback' }, { key: '/idea', label: 'Suggest an idea locally', group: 'System', route: 'feedback' },
  { key: '/focus', label: 'Start a focus session', group: 'Work', route: 'focus' }, { key: '/settings', label: 'Open settings', group: 'System', route: 'settings' },
  { key: '/tools', label: 'Open local tools and integrations', group: 'System', route: 'settings' },
  { key: '/events', label: 'Inspect instrumentation', group: 'System', route: 'instrumentation' },
  { key: '/updates', label: 'Check available updates', group: 'System', route: 'updates' }, { key: '/hardware', label: 'Inspect hardware surfaces', group: 'System', route: 'hardware' },
];
export function CommandPalette({ onClose, onNavigate, onEvent }: Props) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const paletteRef = useRef<HTMLElement>(null);
  const matches = commands.filter((item) => `${item.key} ${item.label}`.toLowerCase().includes(query.toLowerCase()));
  useEffect(() => { setSelectedIndex(0); }, [query]);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); if (event.key !== 'Tab') return; const root = paletteRef.current; if (!root) return; const focusable = Array.from(root.querySelectorAll<HTMLElement>('input,button')).filter((item) => !(item as HTMLButtonElement).disabled); if (!focusable.length) return; const first = focusable[0]!; const last = focusable[focusable.length - 1]!; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onClose]);
  const openCommand = (index: number) => { const item = matches[index]; if (!item) return; onEvent('command', item.key); if (item.route) onNavigate(item.route); };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!matches.length) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); setSelectedIndex((index) => (index + 1) % matches.length); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setSelectedIndex((index) => (index - 1 + matches.length) % matches.length); }
    if (event.key === 'Enter') { event.preventDefault(); openCommand(selectedIndex); }
  };
  return <div className="overlay" onMouseDown={onClose}><section ref={paletteRef} className="palette" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Command palette">
    <div className="palette-search"><span>/</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={handleKeyDown} placeholder="Type a command" aria-activedescendant={matches[selectedIndex] ? `command-${matches[selectedIndex].key.slice(1)}` : undefined} /></div>
    {matches.map((item, index) => <button className="command-row" id={`command-${item.key.slice(1)}`} data-selected={index === selectedIndex} key={item.key} onMouseEnter={() => setSelectedIndex(index)} onClick={() => openCommand(index)}><kbd>{item.key}</kbd><span>{item.label}</span><small>{item.group}</small></button>)}
    {!matches.length && <p className="empty">No command found. Try /week or /focus.</p>}
    <div className="palette-footer"><span>↑↓ select</span><span>↵ open</span><span>esc close</span></div>
  </section></div>;
}

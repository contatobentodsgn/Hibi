import React from 'react';
import { durationMinutes, toDateKey } from '../domain/schedule';
import type { ScheduleBlock, StudyData } from '../domain/models';

type Props = {
  data: StudyData;
  onEvent: (action: string, detail: string, result?: string) => void;
  onCreateBlock: (input: Omit<ScheduleBlock, 'id'>) => void;
  onDeleteBlock?: (id: string) => void;
};

const DAY_DATE = '2026-09-07';
const dayLabel = 'MONDAY · 07 SEPTEMBER 2026';
const toneFor = (category: ScheduleBlock['category']) => category === 'break' ? 'green' : category === 'learning' ? 'blue' : 'orange';
const at = (hour: number) => `${DAY_DATE}T${String(hour).padStart(2, '0')}:00:00-03:00`;

export function DayView({ data, onEvent, onCreateBlock, onDeleteBlock }: Props) {
  const blocks = data.blocks.filter((block) => toDateKey(block.start) === DAY_DATE);
  const addBlock = () => onCreateBlock({ title: 'Quick study block', start: at(8), end: at(9), category: 'work' });
  return <div className="view calendar-view"><div className="view-heading"><div><p className="eyebrow">{dayLabel}</p><h1>Day</h1><p className="muted">{blocks.length} blocks · 1 review checkpoint</p></div><div className="heading-actions"><button className="outline" onClick={() => onEvent('validation', 'Checked day conflicts', 'pass')}>✓ Check plan</button><button className="primary" onClick={() => { addBlock(); onEvent('create', 'Quick add at 08:00'); }}>+ Add</button></div></div><div className="calendar-toolbar"><button className="filter active">Schedule</button><button className="filter">Important</button><button className="filter">Wellbeing</button><span className="spacer" /><button className="filter">24h</button></div><div className="day-grid">{Array.from({ length: 15 }, (_, index) => { const hour = index + 8; const hourBlocks = blocks.filter((item) => Number(item.start.slice(11, 13)) === hour); return <div className="hour-row" key={hour}><span>{String(hour).padStart(2, '0')}:00</span><div className="hour-slot">{hourBlocks.map((block) => <button className={`schedule-card ${toneFor(block.category)}`} aria-label={`Delete ${block.title}`} key={block.id} onClick={() => onDeleteBlock?.(block.id)}><strong>{block.title}</strong><small>{block.start.slice(11, 16)} · {formatDuration(block)} · ×</small></button>)}</div></div>; })}</div></div>;
}

function formatDuration(block: ScheduleBlock): string {
  const minutes = durationMinutes(block);
  return minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}m`;
}

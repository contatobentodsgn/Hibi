import React, { useState } from 'react';
import { localNoon, shiftDayKey, todayKey } from '../domain/date-context';
import { durationMinutes, toDateKey } from '../domain/schedule';
import type { ScheduleBlock, StudyData } from '../domain/models';

type Props = {
  data: StudyData;
  onEvent: (action: string, detail: string, result?: string) => void;
  onCreateBlock: (input: Omit<ScheduleBlock, 'id'>) => void;
  onDeleteBlock?: (id: string) => void;
};

const toneFor = (category: ScheduleBlock['category']) => category === 'break' ? 'green' : category === 'learning' ? 'blue' : 'orange';

export function DayView({ data, onEvent, onCreateBlock, onDeleteBlock }: Props) {
  const [layer, setLayer] = useState<'schedule' | 'important' | 'wellbeing'>('schedule');
  const [dayDate, setDayDate] = useState(() => todayKey());
  const dayLabel = localNoon(dayDate).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase().replace(',', ' ·');
  const blocks = data.blocks.filter((block) => toDateKey(block.start) === dayDate && (layer === 'schedule' || (layer === 'important' ? block.isHard === true : block.category === 'break')));
  const addBlock = () => onCreateBlock({ title: 'Quick study block', start: `${dayDate}T08:00:00`, end: `${dayDate}T09:00:00`, category: 'work' });
  const moveDay = (amount: number) => { setDayDate(shiftDayKey(dayDate, amount)); onEvent('navigation', amount < 0 ? 'Previous day' : 'Next day'); };
 return <div className="view calendar-view"><div className="view-heading"><div><p className="eyebrow">{dayLabel}</p><h1>Day</h1><p className="muted">{blocks.length} blocks · 1 review checkpoint</p></div><div className="heading-actions"><button className="outline" aria-label="Previous day" onClick={() => moveDay(-1)}>←</button><button className="outline" aria-label="Next day" onClick={() => moveDay(1)}>→</button><button className="outline" onClick={() => onEvent('validation', 'Checked day conflicts', 'pass')}>✓ Check plan</button><button className="primary" onClick={() => { addBlock(); onEvent('create', 'Quick add at 08:00'); }}>+ Add</button></div></div><div className="calendar-toolbar">{([['schedule','Schedule'],['important','Important'],['wellbeing','Wellbeing']] as const).map(([value, label]) => <button key={value} className={`filter ${layer === value ? 'active' : ''}`} onClick={() => { setLayer(value); onEvent('filter', `Day · ${label}`); }}>{label}</button>)}<span className="spacer" /><button className="filter">24h</button></div><div className="day-grid">{Array.from({ length: 15 }, (_, index) => { const hour = index + 8; const hourBlocks = blocks.filter((item) => Number(item.start.slice(11, 13)) === hour); return <div className="hour-row" key={hour}><span>{String(hour).padStart(2, '0')}:00</span><div className="hour-slot">{hourBlocks.map((block) => <button className={`schedule-card ${toneFor(block.category)}`} aria-label={`Delete ${block.title} at ${block.start.slice(11, 16)}`} key={block.id} onClick={() => onDeleteBlock?.(block.id)}><strong>{block.title}</strong><small>{block.start.slice(11, 16)} · {formatDuration(block)} · ×</small></button>)}</div></div>; })}</div></div>;
}

function formatDuration(block: ScheduleBlock): string {
  const minutes = durationMinutes(block);
  return minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}m`;
}

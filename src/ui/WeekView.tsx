import React from 'react';
import { durationMinutes, toDateKey } from '../domain/schedule';
import type { ScheduleBlock, StudyData } from '../domain/models';

type Props = {
  data: StudyData;
  onEvent: (action: string, detail: string, result?: string) => void;
  onCreateBlock: (input: Omit<ScheduleBlock, 'id'>) => void;
};

const WEEK_START = '2026-09-07';
const OFFSET = '-03:00';
const weekdayLabels = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function addDays(dateKey: string, amount: number): string {
  const date = new Date(`${dateKey}T12:00:00${OFFSET}`);
  date.setDate(date.getDate() + amount);
  return date.toISOString().slice(0, 10);
}

function dayLabel(dateKey: string): string {
  const day = new Date(`${dateKey}T12:00:00${OFFSET}`).getDay();
  return `${weekdayLabels[day]} ${dateKey.slice(8, 10)}`;
}

const toneFor = (category: ScheduleBlock['category']) => category === 'break' ? 'green' : category === 'learning' ? 'blue' : 'orange';
const formatDuration = (block: ScheduleBlock) => { const minutes = durationMinutes(block); return minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}m`; };

export function WeekView({ data, onEvent, onCreateBlock }: Props) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(WEEK_START, index));
  const addBlock = (date: string, hour: number) => onCreateBlock({ title: 'Quick study block', start: `${date}T${String(hour).padStart(2, '0')}:00:00${OFFSET}`, end: `${date}T${String(hour + 1).padStart(2, '0')}:00:00${OFFSET}`, category: 'work' });
  return <div className="view calendar-view"><div className="view-heading"><div><p className="eyebrow">WEEKLY PLAN · SEPTEMBER 2026</p><h1>Mon 07 — Sun 13</h1><p className="muted">Work windows, protected time and recurring reminders</p></div><button className="primary" onClick={() => { addBlock(WEEK_START, 8); onEvent('create', 'Quick add to weekly calendar'); }}>+ Add</button></div><div className="calendar-toolbar"><button className="filter active">All layers</button><button className="filter">Schedule</button><button className="filter">Important</button><button className="filter">Wellbeing</button><span className="spacer" /><button className="filter">‹</button><button className="filter">›</button></div><div className="week-grid"><div className="week-corner">TIME</div>{days.map((date) => <div className="day-head" key={date}>{dayLabel(date).split(' ')[0]}<b>{date.slice(8, 10)}</b></div>)}{Array.from({ length: 15 }, (_, index) => index + 8).map((hour) => <React.Fragment key={hour}><div className="time-label">{hour}:00</div>{days.map((date) => { const block = data.blocks.find((item) => toDateKey(item.start) === date && Number(item.start.slice(11, 13)) === hour); return <div className="week-slot" key={`${date}-${hour}`} onClick={() => { addBlock(date, hour); onEvent('quick-add', `${date} ${hour}:00`); }}>{block && <div className={`mini-card ${toneFor(block.category)}`}>{block.title} <span>{formatDuration(block)}</span></div>}</div>; })}</React.Fragment>)}</div><div className="conflict-inline"><span>✓</span><strong>No hard conflicts detected</strong><span className="muted">Protected lunch, walking and classes are respected.</span></div></div>;
}

import React, { useEffect, useState } from 'react';
import { localNoon, shiftDayKey, todayKey } from '../domain/date-context';
import { durationMinutes, toDateKey } from '../domain/schedule';
import { overlappingPairs } from '../domain/conflicts';
import { readIcsCalendar, toIcsCalendar } from '../domain/ics';
import { useT } from '../i18n/LocaleProvider';
import { visibleHours } from './calendar-grid';
import { ConflictSummary } from './ConflictSummary';
import type { ScheduleBlock, StudyData } from '../domain/models';
import { ExternalCalendarAgenda } from './ExternalCalendarAgenda';
import { externalEventsForWeek, type ExternalCalendarEvent, type ReadonlyAgendaEvent } from './external-calendar-events';

type Props = { data: StudyData; onEvent: (action: string, detail: string, result?: string) => void; onCreateBlock: (input: Omit<ScheduleBlock, 'id'>) => void; onDeleteBlock?: (id: string) => void };
const names = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const daysFrom = (key: string) => Array.from({ length: 7 }, (_, i) => shiftDayKey(key, i));

export function WeekView({ data, onEvent, onCreateBlock, onDeleteBlock }: Props) {
  const [layer, setLayer] = useState<'all' | 'schedule' | 'important' | 'wellbeing'>('all');
  const [weekStart, setWeekStart] = useState(() => todayKey());
  const [externalEvents, setExternalEvents] = useState<readonly ReadonlyAgendaEvent[]>([]);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const t = useT();
  const days = daysFrom(weekStart);
  const weekBlocks = data.blocks.filter((block) => days.includes(toDateKey(block.start)));
  const matchesLayer = (block: ScheduleBlock) => layer === 'all' || layer === 'schedule' || (layer === 'important' ? block.isHard === true : block.category === 'break');

  useEffect(() => {
    let live = true;
    const load = async () => {
      const bridge = window.hibiDesktop;
      if (!bridge?.getCalendarSyncState || !bridge.readCalendarSyncEvents) return;
      try {
        const state = await bridge.getCalendarSyncState();
        const calendars = state.calendars.filter((calendar) => calendar.mode !== 'disabled').map((calendar) => ({ sourceId: calendar.sourceId as 'apple' | 'google', id: calendar.id }));
        if (calendars.length === 0) { if (live) setExternalEvents([]); return; }
        const events = await bridge.readCalendarSyncEvents({ start: `${weekStart}T00:00:00`, end: `${shiftDayKey(weekStart, 7)}T00:00:00`, calendars });
        if (live) setExternalEvents(externalEventsForWeek(weekStart, events as readonly ExternalCalendarEvent[]));
      } catch { if (live) setExternalEvents([]); }
    };
    void load();
    return () => { live = false; };
  }, [weekStart]);

  const add = (date: string, hour: number) => onCreateBlock({ title: 'Quick study block', start: `${date}T${String(hour).padStart(2, '0')}:00:00`, end: `${date}T${String(hour + 1).padStart(2, '0')}:00:00`, category: 'work' });
  // O que ficou de fora é dito na tela: antes, um evento de dia inteiro sumia calado.
  const importIcs = async (file: File) => {
    const { events, skippedAllDay, skippedInvalid } = file.text ? readIcsCalendar(await file.text()) : { events: [], skippedAllDay: 0, skippedInvalid: 0 };
    for (const event of events) onCreateBlock({ ...event, category: 'work' });
    const count = (key: Parameters<typeof t>[0], value: number) => t(key).replace('{count}', String(value));
    setImportNotice([count('calendar.ics.imported', events.length), skippedAllDay > 0 ? count('calendar.ics.skippedAllDay', skippedAllDay) : '', skippedInvalid > 0 ? count('calendar.ics.skippedInvalid', skippedInvalid) : ''].filter(Boolean).join(' '));
    onEvent('import', file.name, `${events.length} imported · ${skippedAllDay} all-day skipped · ${skippedInvalid} invalid skipped`);
  };
  const exportIcs = () => { const url = URL.createObjectURL(new Blob([toIcsCalendar(data.blocks)], { type: 'text/calendar' })); const link = document.createElement('a'); link.href = url; link.download = 'hibi-calendar.ics'; link.click(); URL.revokeObjectURL(url); onEvent('export', 'Exported calendar ICS', 'pass'); };
  const shortDay = (date: string) => { const day = names[localNoon(date).getDay()]; return `${day[0]}${day.slice(1).toLowerCase()} ${date.slice(8, 10)}`; };
  const rangeLabel = `${shortDay(days[0])} — ${shortDay(days[6])}`;
  const monthLabel = localNoon(weekStart).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }).toUpperCase();
  return <div className="view calendar-view"><div className="view-heading"><div><p className="eyebrow">WEEKLY PLAN · {monthLabel}</p><h1>Week · {rangeLabel}</h1><p className="muted">Work windows, protected time and recurring reminders</p></div><div className="heading-actions"><button className="outline" aria-label="Previous week" onClick={() => { setWeekStart(shiftDayKey(weekStart, -7)); onEvent('navigation', 'Previous week'); }}>←</button><button className="outline" aria-label="Next week" onClick={() => { setWeekStart(shiftDayKey(weekStart, 7)); onEvent('navigation', 'Next week'); }}>→</button><label className="outline">Import .ics<input hidden type="file" accept=".ics,text/calendar" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importIcs(file); }} /></label><button className="outline" onClick={exportIcs}>Export .ics</button><button className="primary" onClick={() => add(weekStart, 8)}>+ Add</button></div></div>{importNotice && <p role="status" className="muted calendar-import-notice">{importNotice}</p>}<div className="calendar-toolbar">{([['all', 'All layers'], ['schedule', 'Schedule'], ['important', 'Important'], ['wellbeing', 'Wellbeing']] as const).map(([value, label]) => <button key={value} className={`filter ${layer === value ? 'active' : ''}`} onClick={() => { setLayer(value); onEvent('filter', `Week · ${label}`); }}>{label}</button>)}</div><div className="week-grid"><div className="week-corner">TIME</div>{days.map((date) => <div className="day-head" key={date}>{names[localNoon(date).getDay()]}<b>{date.slice(8, 10)}</b></div>)}{visibleHours(weekBlocks).map((hour) => <React.Fragment key={hour}><div className="time-label">{hour}:00</div>{days.map((date) => { const blocks = data.blocks.filter((block) => toDateKey(block.start) === date && Number(block.start.slice(11, 13)) === hour && matchesLayer(block)); return <div className="week-slot" key={`${date}-${hour}`} role="button" tabIndex={0} aria-label={`Add block ${date} at ${String(hour).padStart(2, '0')}:00`} onClick={() => add(date, hour)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); add(date, hour); } }}>{blocks.map((block) => <button className="mini-card orange" aria-label={`Delete ${block.title} at ${block.start.slice(11, 16)} on ${date}`} key={block.id} onClick={(event) => { event.stopPropagation(); onDeleteBlock?.(block.id); }}>{block.title}<span>{durationMinutes(block) / 60}h · ×</span></button>)}</div>; })}</React.Fragment>)}</div><ExternalCalendarAgenda events={externalEvents} /><ConflictSummary pairs={overlappingPairs(weekBlocks)} emptyText={t('calendar.conflicts.none.week')} /></div>;
}

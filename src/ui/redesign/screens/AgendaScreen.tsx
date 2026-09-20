import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Plus } from 'lucide-react';
import { Button, Card } from '@heroui/react';
import type { ScheduleBlock, StudyData } from '../../../domain/models';
import { shiftDayKey, localNoon, todayKey } from '../../../domain/date-context';
import { durationMinutes, toDateKey } from '../../../domain/schedule';
import { visibleHours } from '../../calendar-grid';
import { AgendaAvailability } from '../../AgendaAvailability';
import { HibiEmptyState } from '../components/HibiEmptyState';
import { HibiTag } from '../components/HibiTag';
import { HibiUiRoot } from '../components/HibiUiRoot';
import { SectionHeader } from '../components/SectionHeader';
import './agenda-screen.css';

export type AgendaDisplayMode = 'day' | 'week';
type Props = Readonly<{
  data: StudyData;
  mode: AgendaDisplayMode;
  date?: string;
  onModeChange: (mode: AgendaDisplayMode) => void;
  onDateChange?: (date: string) => void;
  onEvent: (action: string, detail: string, result?: string) => void;
  onCreateBlock: (input: Omit<ScheduleBlock, 'id'>) => void;
  onDeleteBlock?: (id: string) => void;
  onMoveBlock?: (id: string, start: string, end: string) => boolean;
}>;

const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const categoryName: Record<ScheduleBlock['category'], string> = { work: 'Foco', learning: 'Estudo', break: 'Pausa', important: 'Importante', wellbeing: 'Bem-estar' };
const categoryTone: Record<ScheduleBlock['category'], 'mint' | 'peach' | 'lavender' | 'neutral'> = { work: 'lavender', learning: 'mint', break: 'mint', important: 'peach', wellbeing: 'mint' };

function weekDays(start: string) { return Array.from({ length: 7 }, (_, index) => shiftDayKey(start, index)); }
function dateLabel(date: string) { return localNoon(date).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }); }
function hourTime(hour: number) { return `${String(hour).padStart(2, '0')}:00`; }
function periodLabel(mode: AgendaDisplayMode, date: string) { if (mode === 'day') return dateLabel(date); const days = weekDays(date); return `${days[0].slice(8, 10)}–${days[6].slice(8, 10)} de ${localNoon(days[0]).toLocaleDateString('pt-BR', { month: 'long' })}`; }

export function AgendaScreen({ data, mode, date: initialDate, onModeChange, onDateChange, onEvent, onCreateBlock, onDeleteBlock, onMoveBlock }: Props) {
  const [date, setDate] = useState(initialDate ?? todayKey());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const visibleDays = mode === 'day' ? [date] : weekDays(date);
  const blocks = useMemo(() => data.blocks.filter((block) => visibleDays.includes(toDateKey(block.start))), [data.blocks, visibleDays.join('|')]);
  const hours = visibleHours(blocks, false);
  const selected = data.blocks.find((block) => block.id === selectedId);
  const movePeriod = (amount: number) => { const next = shiftDayKey(date, mode === 'week' ? amount * 7 : amount); setDate(next); onDateChange?.(next); onEvent('navigation', amount < 0 ? `Agenda anterior · ${mode}` : `Agenda seguinte · ${mode}`); };
  const createAt = (day: string, hour: number) => { onCreateBlock({ title: 'Novo bloco', start: `${day}T${hourTime(hour)}:00`, end: `${day}T${hourTime(Math.min(hour + 1, 23))}:00`, category: 'work' }); onEvent('create', `Bloco · ${day} ${hourTime(hour)}`); };
  const editSelected = (start: string, end: string) => { if (!selected || !onMoveBlock) return; if (onMoveBlock(selected.id, start, end)) setSelectedId(null); };

  return <HibiUiRoot className="agenda-screen">
    <SectionHeader title="Agenda" subtitle={periodLabel(mode, date)} actions={<Button variant="primary" onPress={() => createAt(date, 9)}><Plus size={17} />Criar bloco</Button>} />
    <div className="agenda-screen__toolbar"><Button isIconOnly variant="ghost" aria-label={mode === 'day' ? 'Dia anterior' : 'Semana anterior'} onPress={() => movePeriod(-1)}><ChevronLeft size={18} /></Button><Button variant="secondary" onPress={() => { const today = todayKey(); setDate(today); onDateChange?.(today); onEvent('navigation', 'Agenda · Hoje'); }}>Hoje</Button><Button isIconOnly variant="ghost" aria-label={mode === 'day' ? 'Próximo dia' : 'Próxima semana'} onPress={() => movePeriod(1)}><ChevronRight size={18} /></Button><div className="agenda-screen__modes" role="tablist" aria-label="Modo da agenda"><button type="button" role="tab" aria-selected={mode === 'day'} onClick={() => onModeChange('day')}>Dia</button><button type="button" role="tab" aria-selected={mode === 'week'} onClick={() => onModeChange('week')}>Semana</button></div></div>
    <AgendaAvailability blocks={data.blocks} days={visibleDays} />
    <div className="agenda-screen__body"><Card className="agenda-screen__grid-card"><div className={`agenda-screen__grid agenda-screen__grid--${mode}`}><div className="agenda-screen__corner"><Clock3 size={14} /></div>{visibleDays.map((day) => <div className="agenda-screen__day-head" key={day}><span>{dayNames[localNoon(day).getDay()]}</span><strong>{day.slice(8, 10)}</strong></div>)}{hours.map((hour) => <div className="agenda-screen__row" key={hour}><time>{hourTime(hour)}</time>{visibleDays.map((day) => { const hourBlocks = blocks.filter((block) => toDateKey(block.start) === day && Number(block.start.slice(11, 13)) === hour); return <div className="agenda-screen__slot" key={`${day}-${hour}`}><button className="agenda-screen__slot-create" aria-label={`Criar bloco em ${day} às ${hourTime(hour)}`} onClick={() => createAt(day, hour)}>+</button>{hourBlocks.map((block) => <button className="agenda-screen__event" data-category={block.category} key={block.id} onClick={() => setSelectedId(block.id)} aria-label={`Abrir ${block.title}, ${block.start.slice(11, 16)}`}><strong>{block.title}</strong><span>{block.start.slice(11, 16)} · {durationMinutes(block)} min</span><HibiTag tone={categoryTone[block.category]}>{categoryName[block.category]}</HibiTag></button>)}</div>; })}</div>)}</div>{blocks.length === 0 && <HibiEmptyState icon={CalendarDays} tone="lavender" title="A semana está livre" description="Crie um bloco quando quiser reservar tempo para algo importante." action={<Button variant="secondary" onPress={() => createAt(date, 9)}>Criar bloco</Button>} />}</Card>
      <aside className="agenda-screen__detail" aria-label="Detalhe do bloco">{selected ? <BlockDetails block={selected} onClose={() => setSelectedId(null)} onDelete={() => { onDeleteBlock?.(selected.id); setSelectedId(null); }} onSave={editSelected} /> : <Card><CalendarDays size={20} /><h2>Seu tempo, por inteiro.</h2><p>Escolha um bloco para ver ou ajustar seus horários locais.</p></Card>}</aside>
    </div>
  </HibiUiRoot>;
}

function BlockDetails({ block, onClose, onDelete, onSave }: Readonly<{ block: ScheduleBlock; onClose: () => void; onDelete: () => void; onSave: (start: string, end: string) => void }>) {
  const [start, setStart] = useState(block.start.slice(0, 16));
  const [end, setEnd] = useState(block.end.slice(0, 16));
  return <Card><div className="agenda-screen__detail-title"><HibiTag tone={categoryTone[block.category]}>{categoryName[block.category]}</HibiTag><Button isIconOnly variant="ghost" aria-label="Fechar detalhe" onPress={onClose}>×</Button></div><h2>{block.title}</h2><p>{dateLabel(block.start.slice(0, 10))}</p><form onSubmit={(event) => { event.preventDefault(); onSave(`${start}:00`, `${end}:00`); }}><label>Início<input type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} /></label><label>Fim<input type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} /></label><Button type="submit" variant="primary">Salvar horário</Button></form><Button variant="danger" onPress={onDelete}>Excluir bloco</Button></Card>;
}

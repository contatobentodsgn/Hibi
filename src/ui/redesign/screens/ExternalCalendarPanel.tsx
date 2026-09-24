import { AlertTriangle, CalendarSync, CheckCircle2, Cloud, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { Button, Card } from '@heroui/react';
import type { CalendarSyncConflict, CalendarSyncState } from '../../calendar-sync';
import type { ReadonlyAgendaEvent } from '../../external-calendar-events';
import { PixanoTag } from '../components/PixanoTag';
import './external-calendar-panel.css';

type CalendarChanges = Readonly<{
  outgoing: readonly Readonly<{ localId: string; calendarId: string; summary: string }> [];
  incoming: readonly Readonly<{ localId: string; calendarId: string; summary: string; start: string; end: string }> [];
}>;

type Props = Readonly<{
  state: CalendarSyncState;
  events: readonly ReadonlyAgendaEvent[];
  changes: CalendarChanges;
  onRefresh: () => void;
  onSendChange: (change: CalendarChanges['outgoing'][number]) => void;
  onBringChange: (change: CalendarChanges['incoming'][number]) => void;
  onResolveConflict: (conflict: CalendarSyncConflict, choice: 'keep-calendar' | 'keep-hibi') => void;
}>;

const sourceState = (state: CalendarSyncState['sources'][number]['state']) => state === 'connected' ? 'Conectado' : state === 'needs-permission' ? 'Permissão necessária' : state === 'error' ? 'Precisa de atenção' : 'Desconectado';
const modeLabel = (mode: CalendarSyncState['calendars'][number]['mode']) => mode === 'bidirectional' ? 'Bidirecional' : mode === 'read-only' ? 'Somente leitura' : 'Desativado';
const time = (value: string) => value.slice(11, 16);

export function ExternalCalendarPanel({ state, events, changes, onRefresh, onSendChange, onBringChange, onResolveConflict }: Props) {
  const hasWork = changes.outgoing.length > 0 || changes.incoming.length > 0 || state.conflicts.length > 0;
  if (state.sources.length === 0 && events.length === 0 && !hasWork) return null;

  return <section className="external-calendar-panel" aria-label="Agenda externa e conflitos">
    <div className="external-calendar-panel__heading">
      <div><p className="eyebrow">AGENDA EXTERNA</p><h2>Calendários conectados</h2><p>Reuniões protegem seu tempo. Nenhuma alteração sai do Pixano sem a sua confirmação.</p></div>
      <Button variant="secondary" onPress={onRefresh}><RefreshCw size={15} />Atualizar</Button>
    </div>

    <div className="external-calendar-panel__sources">{state.sources.map((source) => <Card key={source.id} className="external-calendar-panel__source"><Cloud size={17} /><div><strong>{source.label}</strong><span>{sourceState(source.state)}{source.lastSyncedAt ? ` · ${source.lastSyncedAt.slice(0, 10)} ${time(source.lastSyncedAt)}` : ''}</span></div></Card>)}</div>
    {state.calendars.length > 0 && <div className="external-calendar-panel__calendars" aria-label="Calendários selecionados">{state.calendars.map((calendar) => <PixanoTag key={calendar.id} tone={calendar.mode === 'bidirectional' ? 'lavender' : 'neutral'}><CalendarSync size={12} />{calendar.label} · {modeLabel(calendar.mode)}</PixanoTag>)}</div>}

    {events.length > 0 && <Card className="external-calendar-panel__events"><div className="external-calendar-panel__section-title"><div><h3>O que já está no seu dia</h3><p>Eventos externos aparecem como contexto, não como blocos editáveis do Pixano.</p></div><PixanoTag tone="neutral"><ShieldCheck size={12} />Somente leitura</PixanoTag></div><ul>{events.map((event) => <li key={`${event.source}-${event.startsAt}-${event.title}`}><span className="external-calendar-panel__event-time">{`${time(event.startsAt)}–${time(event.endsAt)}`}</span><div><strong>{event.title}</strong><span>{event.source}</span></div></li>)}</ul></Card>}

    {hasWork && <div className="external-calendar-panel__work">
      {changes.outgoing.length > 0 && <Card><div className="external-calendar-panel__section-title"><div><h3>Alterado no Pixano</h3><p>Revise cada envio antes de publicar no calendário.</p></div><Send size={17} /></div><ul>{changes.outgoing.map((change) => <li key={`${change.calendarId}-${change.localId}`}><span>{change.summary}</span><Button size="sm" variant="secondary" onPress={() => onSendChange(change)}>Revisar envio</Button></li>)}</ul></Card>}
      {changes.incoming.length > 0 && <Card><div className="external-calendar-panel__section-title"><div><h3>Alterado no calendário</h3><p>Traga a mudança para o Pixano quando estiver pronto.</p></div><CalendarSync size={17} /></div><ul>{changes.incoming.map((change) => <li key={`${change.calendarId}-${change.localId}`}><span>{change.summary} · {time(change.start)}–{time(change.end)}</span><Button size="sm" variant="secondary" onPress={() => onBringChange(change)}>Trazer para o Pixano</Button></li>)}</ul></Card>}
      {state.conflicts.map((conflict) => <Card key={conflict.id} className="external-calendar-panel__conflict"><div><AlertTriangle size={18} /><div><h3>{conflict.kind === 'remote-deleted' ? 'Evento apagado no calendário' : 'Edição em conflito'}</h3><p>{conflict.summary}</p></div></div><div className="external-calendar-panel__conflict-actions"><Button variant="secondary" onPress={() => onResolveConflict(conflict, 'keep-calendar')}>{conflict.kind === 'remote-deleted' ? 'Manter apenas no Pixano' : 'Manter calendário'}</Button><Button variant="primary" onPress={() => onResolveConflict(conflict, 'keep-hibi')}><CheckCircle2 size={15} />{conflict.kind === 'remote-deleted' ? 'Recriar no calendário' : 'Manter Pixano'}</Button></div></Card>)}
    </div>}
  </section>;
}

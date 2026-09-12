import React from 'react'
import type { CalendarSyncCalendar, CalendarSyncConflict, CalendarSyncMode, CalendarSyncSource, CalendarSyncState } from './calendar-sync'
import './calendar-sync.css'

type Props = Readonly<{
  state: CalendarSyncState
  onConnect: (source: CalendarSyncSource) => void
  onChangeMode: (calendar: CalendarSyncCalendar, mode: CalendarSyncMode) => void
  onSync: (source: CalendarSyncSource) => void
  onResolveConflict: (conflict: CalendarSyncConflict) => void
}>

const errorLabel = (error: CalendarSyncSource['error']) => error === 'invalid-credential' ? 'credential needs attention' : error === 'permission-denied' ? 'permission is required' : error === 'configuration-incomplete' ? 'configuration is incomplete' : 'temporarily unavailable'
const syncLabel = (at?: string) => at ? `Última sincronização: ${at.slice(0, 10)} ${at.slice(11, 16)}` : 'Ainda não sincronizado'
const modeLabel = (mode: CalendarSyncMode) => mode === 'disabled' ? 'Desativado' : mode === 'read-only' ? 'Somente leitura' : 'Bidirecional'

export function CalendarSyncPanel({ state, onConnect, onChangeMode, onSync, onResolveConflict }: Props) {
  return <section className="calendar-sync-panel" aria-label="Calendários conectados">
    <div className="calendar-sync-heading"><div><p className="eyebrow">CALENDÁRIO</p><h3>Calendários conectados</h3><p className="muted">Reuniões entram para proteger seu tempo. Publicar um bloco Hibi é sempre uma escolha explícita.</p></div></div>
    <div className="calendar-sync-sources">{state.sources.map((source) => <article className="calendar-sync-source" key={source.id}>
      <div><strong>{source.label}</strong><span>{source.state === 'connected' ? 'Conectado' : source.state === 'needs-permission' ? 'Permissão necessária' : source.state === 'error' ? errorLabel(source.error) : 'Desconectado'} · {syncLabel(source.lastSyncedAt)}</span></div>
      <div className="calendar-sync-actions">{source.state === 'connected' ? <button className="outline" onClick={() => onSync(source)}>Sincronizar agora</button> : <button className="outline" onClick={() => onConnect(source)}>{source.provider === 'apple' ? 'Permitir Calendário' : 'Conectar Google'}</button>}</div>
    </article>)}</div>
    {state.calendars.length > 0 && <div className="calendar-sync-calendars" aria-label="Calendários selecionados">{state.calendars.map((calendar) => <article className="calendar-sync-calendar" key={calendar.id}>
      <div><strong>{calendar.label}</strong><span>{syncLabel(calendar.lastSyncedAt)}</span></div>
      <select aria-label={`Modo de sincronização para ${calendar.label}`} value={calendar.mode} onChange={(event) => onChangeMode(calendar, event.target.value as CalendarSyncMode)}>
        {(['disabled', 'read-only', 'bidirectional'] as const).map((mode) => <option key={mode} value={mode}>{modeLabel(mode)}</option>)}
      </select>
    </article>)}</div>}
    {state.conflicts.length > 0 && <div className="calendar-sync-conflicts" aria-label="Conflitos de calendário"><strong>Revisar conflitos</strong>{state.conflicts.map((conflict) => <div className="calendar-sync-conflict" key={conflict.id}><span>{conflict.summary}</span><button className="outline" aria-label={`Resolver conflito: ${conflict.summary}`} onClick={() => onResolveConflict(conflict)}>Revisar</button></div>)}</div>}
  </section>
}

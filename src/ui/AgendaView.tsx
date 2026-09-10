import React, { useEffect, useState } from 'react'
import { useT } from '../i18n/LocaleProvider'
import type { ScheduleBlock, StudyData } from '../domain/models'
import { DayView } from './DayView'
import { WeekView } from './WeekView'

export type AgendaMode = 'day' | 'week'
export const AGENDA_VIEW_STORAGE_KEY = 'hibi-agenda-view'

export const readAgendaMode = (): AgendaMode => { try { return window.localStorage.getItem(AGENDA_VIEW_STORAGE_KEY) === 'week' ? 'week' : 'day' } catch { return 'day' } }

type Props = Readonly<{
  data: StudyData
  mode?: AgendaMode
  onEvent: (action: string, detail: string, result?: string) => void
  onCreateBlock: (input: Omit<ScheduleBlock, 'id'>) => void
  onDeleteBlock?: (id: string) => void
  onModeChange?: (mode: AgendaMode) => void
}>

// Dia e Semana numa seção só. Sem `mode` explícito, lembra a última escolha.
export function AgendaView({ data, mode, onEvent, onCreateBlock, onDeleteBlock, onModeChange }: Props) {
  const t = useT()
  const [current, setCurrent] = useState<AgendaMode>(() => mode ?? readAgendaMode())
  useEffect(() => { if (mode) setCurrent(mode) }, [mode])
  const select = (next: AgendaMode) => { setCurrent(next); try { window.localStorage.setItem(AGENDA_VIEW_STORAGE_KEY, next) } catch { /* armazenamento indisponível */ } onEvent('navigation', `Agenda · ${next}`); onModeChange?.(next) }
  return <div className="agenda-view">
    <div className="filter-row" role="tablist" aria-label={t('agenda.toggle')}>
      <button type="button" role="tab" className={`filter${current === 'day' ? ' active' : ''}`} aria-selected={current === 'day'} onClick={() => select('day')}>{t('agenda.day')}</button>
      <button type="button" role="tab" className={`filter${current === 'week' ? ' active' : ''}`} aria-selected={current === 'week'} onClick={() => select('week')}>{t('agenda.week')}</button>
    </div>
    {current === 'day' ? <DayView data={data} onEvent={onEvent} onCreateBlock={onCreateBlock} onDeleteBlock={onDeleteBlock} /> : <WeekView data={data} onEvent={onEvent} onCreateBlock={onCreateBlock} onDeleteBlock={onDeleteBlock} />}
  </div>
}

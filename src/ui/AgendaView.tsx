import React, { useState } from 'react'
import { useT } from '../i18n/LocaleProvider'
import type { ScheduleBlock, StudyData } from '../domain/models'
import { DayView } from './DayView'
import { WeekView } from './WeekView'
import { browserAgendaHost, readAgendaMode, writeAgendaMode, type AgendaHost, type AgendaMode } from './agenda-storage'

export type { AgendaMode } from './agenda-storage'

type Props = Readonly<{
  data: StudyData
  mode?: AgendaMode
  onEvent: (action: string, detail: string, result?: string) => void
  onCreateBlock: (input: Omit<ScheduleBlock, 'id'>) => void
  onDeleteBlock?: (id: string) => void
  onModeChange?: (mode: AgendaMode) => void
  host?: AgendaHost
}>

// Dia e Semana numa seção só. Sem `mode` explícito, lembra a última escolha.
// `host` é opcional para testes injetarem um fake; em produção cai para browserAgendaHost(),
// construído de forma preguiçosa (dentro do useState) para que importar este módulo nunca toque em `window`.
export function AgendaView({ data, mode, onEvent, onCreateBlock, onDeleteBlock, onModeChange, host }: Props) {
  const t = useT()
  const [agendaHost] = useState<AgendaHost>(() => host ?? browserAgendaHost())
  const [storedMode, setStoredMode] = useState<AgendaMode>(() => readAgendaMode(agendaHost.storage))
  const current = mode ?? storedMode
  const select = (next: AgendaMode) => {
    setStoredMode(next)
    writeAgendaMode(agendaHost.storage, next)
    onEvent('navigation', `Agenda · ${next}`)
    onModeChange?.(next)
  }
  return <div className="agenda-view">
    <div className="filter-row" role="tablist" aria-label={t('agenda.toggle')}>
      <button type="button" role="tab" className={`filter${current === 'day' ? ' active' : ''}`} aria-selected={current === 'day'} onClick={() => select('day')}>{t('agenda.day')}</button>
      <button type="button" role="tab" className={`filter${current === 'week' ? ' active' : ''}`} aria-selected={current === 'week'} onClick={() => select('week')}>{t('agenda.week')}</button>
    </div>
    {current === 'day' ? <DayView data={data} onEvent={onEvent} onCreateBlock={onCreateBlock} onDeleteBlock={onDeleteBlock} /> : <WeekView data={data} onEvent={onEvent} onCreateBlock={onCreateBlock} onDeleteBlock={onDeleteBlock} />}
  </div>
}

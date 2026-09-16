import React from 'react'
import { todayKey } from '../domain/date-context'
import type { ScheduleBlock } from '../domain/models'
import { findConflicts } from '../domain/conflicts'
import { deriveDayRhythm, formatMinutes, formatWindow, type FreeWindow } from './day-rhythm'
import './agenda-atelier.css'

type Props = Readonly<{
  blocks: readonly ScheduleBlock[]
  days: readonly string[]
  wallClock?: string
  now?: Date
}>

export function AgendaAvailability({ blocks, days, wallClock = new Date().toTimeString().slice(0, 5), now }: Props) {
  // O relógio só corta o dia de hoje. Num dia adiante, a manhã inteira ainda está livre, e usar a
  // hora atual apagaria as janelas da manhã de amanhã a partir do meio-dia de hoje.
  const today = todayKey(now)
  const rhythms = days.map((day) => deriveDayRhythm(blocks, day, day === today ? wallClock : '00:00'))
  const plannedMinutes = rhythms.reduce((total, rhythm) => total + rhythm.plannedMinutes, 0)
  const focusBlocks = rhythms.reduce((total, rhythm) => total + rhythm.workCount, 0)
  const nextFreeWindow = rhythms.flatMap((rhythm) => rhythm.freeWindows).find((window): window is FreeWindow => window.minutes > 0)
  const visibleBlocks = blocks.filter((block) => days.includes(block.start.slice(0, 10)))
  const conflicts = new Set(visibleBlocks.flatMap((block) => findConflicts(block, visibleBlocks).map((conflict) => [conflict.proposedId, conflict.existingId].sort().join(':'))))

  return <section className="agenda-availability" aria-label="Agenda availability">
    <div><span>Time planned</span><strong>{formatMinutes(plannedMinutes)}</strong></div>
    <div><span>Focus blocks</span><strong>{focusBlocks}</strong></div>
    <div><span>Next free window</span><strong>{formatWindow(nextFreeWindow)}</strong></div>
    <div><span>Schedule conflicts</span><strong>{conflicts.size === 0 ? 'None' : `${conflicts.size} to review`}</strong></div>
  </section>
}

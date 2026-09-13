import React from 'react'
import type { ScheduleBlock } from '../domain/models'
import { deriveDayRhythm, formatMinutes, formatWindow, type FreeWindow } from './day-rhythm'
import './agenda-atelier.css'

type Props = Readonly<{
  blocks: readonly ScheduleBlock[]
  days: readonly string[]
  wallClock?: string
}>

export function AgendaAvailability({ blocks, days, wallClock = new Date().toTimeString().slice(0, 5) }: Props) {
  const rhythms = days.map((day) => deriveDayRhythm(blocks, day, wallClock))
  const plannedMinutes = rhythms.reduce((total, rhythm) => total + rhythm.plannedMinutes, 0)
  const focusBlocks = rhythms.reduce((total, rhythm) => total + rhythm.workCount, 0)
  const nextFreeWindow = rhythms.flatMap((rhythm) => rhythm.freeWindows).find((window): window is FreeWindow => window.minutes > 0)

  return <section className="agenda-availability" aria-label="Agenda availability">
    <div><span>Time planned</span><strong>{formatMinutes(plannedMinutes)}</strong></div>
    <div><span>Focus blocks</span><strong>{focusBlocks}</strong></div>
    <div><span>Next free window</span><strong>{formatWindow(nextFreeWindow)}</strong></div>
  </section>
}

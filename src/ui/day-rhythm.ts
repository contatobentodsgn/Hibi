import type { ScheduleBlock } from '../domain/models'
import { toDateKey } from '../domain/schedule'

export type RhythmBlock = Readonly<{ id: string; title: string; start: string; end: string; category: ScheduleBlock['category']; minutes: number }>
export type FreeWindow = Readonly<{ start: string; end: string; minutes: number }>
export type DayRhythm = Readonly<{
  now: RhythmBlock | null
  later: readonly RhythmBlock[]
  completed: readonly RhythmBlock[]
  plannedMinutes: number
  workCount: number
  freeWindows: readonly FreeWindow[]
}>

const timeMinutes = (value: string): number | null => {
  const match = /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})/.exec(value)
  if (!match) return null
  const hour = Number(match[1]); const minute = Number(match[2])
  return hour >= 0 && hour < 24 && minute >= 0 && minute < 60 ? hour * 60 + minute : null
}

const formatTime = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

type TimedBlock = RhythmBlock & Readonly<{ startMinutes: number; endMinutes: number }>

const asTimedBlock = (block: ScheduleBlock): TimedBlock | null => {
  const startMinutes = timeMinutes(block.start); const endMinutes = timeMinutes(block.end)
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return null
  return { id: block.id, title: block.title, start: block.start, end: block.end, category: block.category, minutes: endMinutes - startMinutes, startMinutes, endMinutes }
}

export function deriveDayRhythm(blocks: readonly ScheduleBlock[], day: string, wallClock: string): DayRhythm {
  const nowMinutes = /^([01]\d|2[0-3]):[0-5]\d$/.test(wallClock) ? Number(wallClock.slice(0, 2)) * 60 + Number(wallClock.slice(3, 5)) : 0
  const timed = blocks
    .filter((block) => toDateKey(block.start) === day && block.category !== 'break')
    .flatMap((block) => { const value = asTimedBlock(block); return value ? [value] : [] })
    .sort((left, right) => left.startMinutes - right.startMinutes || left.id.localeCompare(right.id))
  const now = timed.find((block) => block.startMinutes <= nowMinutes && nowMinutes < block.endMinutes) ?? timed.find((block) => block.startMinutes >= nowMinutes) ?? timed[0] ?? null
  const completed = timed.filter((block) => block.endMinutes <= nowMinutes)
  const later = timed.filter((block) => block !== now && block.startMinutes >= nowMinutes)
  const freeWindows: FreeWindow[] = []
  for (let index = 1; index < timed.length; index += 1) {
    const start = timed[index - 1].endMinutes; const end = timed[index].startMinutes
    if (end - start >= 30) freeWindows.push({ start: formatTime(start), end: formatTime(end), minutes: end - start })
  }
  return {
    now,
    later,
    completed,
    plannedMinutes: timed.reduce((total, block) => total + block.minutes, 0),
    workCount: timed.length,
    freeWindows,
  }
}

export const formatMinutes = (minutes: number): string => minutes >= 60 && minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}m`
export const formatWindow = (window?: FreeWindow): string => window ? `${window.start}–${window.end}` : 'No free window remaining'

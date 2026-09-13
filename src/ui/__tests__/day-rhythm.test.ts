import { describe, expect, it } from 'vitest'
import type { ScheduleBlock } from '../../domain/models'
import { deriveDayRhythm } from '../day-rhythm'

const block = (id: string, title: string, start: string, end: string, category: ScheduleBlock['category'] = 'work'): ScheduleBlock => ({ id, title, start, end, category })

describe('deriveDayRhythm', () => {
  it('selects the active local block before a later block', () => {
    const rhythm = deriveDayRhythm([
      block('now', 'Write proposal', '2026-09-14T09:00:00', '2026-09-14T10:00:00'),
      block('later', 'Review', '2026-09-14T11:00:00', '2026-09-14T12:00:00'),
    ], '2026-09-14', '09:30')

    expect(rhythm.now).toMatchObject({ id: 'now', title: 'Write proposal', minutes: 60 })
    expect(rhythm.later).toMatchObject([{ id: 'later' }])
    expect(rhythm.plannedMinutes).toBe(120)
  })

  it('exposes only free windows of at least thirty minutes and ignores invalid ranges', () => {
    const rhythm = deriveDayRhythm([
      block('first', 'Morning work', '2026-09-14T09:00:00', '2026-09-14T10:00:00'),
      block('second', 'Review', '2026-09-14T11:00:00', '2026-09-14T12:00:00'),
      block('invalid', 'Broken', '2026-09-14T13:00:00', '2026-09-14T12:00:00'),
    ], '2026-09-14', '08:00')

    expect(rhythm.freeWindows).toEqual([{ start: '10:00', end: '11:00', minutes: 60 }])
  })
})

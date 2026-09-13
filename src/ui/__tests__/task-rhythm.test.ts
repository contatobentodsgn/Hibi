import { describe, expect, it } from 'vitest'
import { deriveTaskRhythm } from '../task-rhythm'

const tasks = [
  { id: 'overdue', title: 'Overdue', durationMinutes: 30, category: 'work', deadline: '2026-09-13T09:00:00' },
  { id: 'today', title: 'Today', durationMinutes: 60, category: 'work', deadline: '2026-09-14T10:00:00' },
  { id: 'later', title: 'Later', durationMinutes: 30, category: 'work', deadline: '2026-09-15T10:00:00' },
  { id: 'none', title: 'No deadline', durationMinutes: 30, category: 'work' },
  { id: 'done', title: 'Done', durationMinutes: 30, category: 'work', status: 'completed' },
] as const

describe('deriveTaskRhythm', () => {
  it('prioritizes overdue open work and describes deadline buckets with local dates', () => {
    const rhythm = deriveTaskRhythm(tasks, '2026-09-14')

    expect(rhythm.next?.id).toBe('overdue')
    expect(rhythm.overdue).toBe(1)
    expect(rhythm.dueToday).toBe(1)
    expect(rhythm.withoutDeadline).toBe(1)
    expect(rhythm.deadlineStateById.overdue).toBe('overdue')
    expect(rhythm.deadlineStateById.today).toBe('today')
    expect(rhythm.deadlineStateById.none).toBe('none')
  })
})

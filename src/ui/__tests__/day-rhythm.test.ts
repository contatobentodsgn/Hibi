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

    // Às 08:00 a manhã até o primeiro bloco também é tempo livre de verdade.
    expect(rhythm.freeWindows).toEqual([
      { start: '08:00', end: '09:00', minutes: 60 },
      { start: '10:00', end: '11:00', minutes: 60 },
    ])
  })

  it('com o dia terminado, não anuncia nenhum bloco como agora', () => {
    const rhythm = deriveDayRhythm([
      block('morning', 'Write proposal', '2026-09-14T09:00:00', '2026-09-14T10:00:00'),
      block('afternoon', 'Review', '2026-09-14T14:00:00', '2026-09-14T15:00:00'),
    ], '2026-09-14', '23:00')

    // Devolver o bloco da manhã faria a tela oferecer "começar o foco" às 23h.
    expect(rhythm.now).toBe(null)
    expect(rhythm.later).toEqual([])
    expect(rhythm.completed.map((entry) => entry.id)).toEqual(['morning', 'afternoon'])
  })

  it('uma janela livre que já acabou não é oferecida, e a que está em curso começa agora', () => {
    const blocos = [
      block('morning', 'Morning work', '2026-09-14T09:00:00', '2026-09-14T10:00:00'),
      block('afternoon', 'Review', '2026-09-14T14:00:00', '2026-09-14T15:00:00'),
      block('evening', 'Study', '2026-09-14T18:00:00', '2026-09-14T19:00:00'),
    ]

    expect(deriveDayRhythm(blocos, '2026-09-14', '12:30').freeWindows).toEqual([
      { start: '12:30', end: '14:00', minutes: 90 },
      { start: '15:00', end: '18:00', minutes: 180 },
    ])
    // Depois do último bloco não sobra janela com fim conhecido para anunciar.
    expect(deriveDayRhythm(blocos, '2026-09-14', '19:30').freeWindows).toEqual([])
  })
})

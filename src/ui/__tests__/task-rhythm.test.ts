import { describe, expect, it } from 'vitest'
import { deriveTaskRhythm } from '../task-rhythm'

const tasks = [
  { id: 'overdue', title: 'Overdue', durationMinutes: 30, category: 'work', deadline: '2026-09-13T09:00:00' },
  { id: 'today', title: 'Today', durationMinutes: 60, category: 'work', deadline: '2026-09-14T10:00:00' },
  { id: 'later', title: 'Later', durationMinutes: 30, category: 'work', deadline: '2026-09-15T10:00:00' },
  { id: 'none', title: 'No deadline', durationMinutes: 30, category: 'work' },
  { id: 'done', title: 'Done', durationMinutes: 30, category: 'work', status: 'completed' },
  { id: 'paused', title: 'Paused', durationMinutes: 30, category: 'work', status: 'paused', deadline: '2026-09-12T10:00:00' },
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

    // Concluída e pausada não são trabalho aberto: a pausada vence antes de todas e, se contasse,
    // seria ela a próxima e o número de atrasadas subiria.
    expect(rhythm.open).toBe(4)
    expect(rhythm.deadlineStateById.paused).toBe(undefined)
    expect(rhythm.deadlineStateById.done).toBe(undefined)
  })

  it('ordena por urgência, depois por prazo e por título, sem depender da ordem de entrada', () => {
    const mesmoDia = [
      // O título contraria o prazo de propósito: sem o desempate por prazo, "Alfa" venceria.
      { id: 'tarde', title: 'Alfa', durationMinutes: 30, category: 'work' as const, deadline: '2026-09-14T15:00:00' },
      { id: 'cedo', title: 'Zulu', durationMinutes: 30, category: 'work' as const, deadline: '2026-09-14T09:00:00' },
      { id: 'sem', title: 'Sem prazo', durationMinutes: 30, category: 'work' as const },
      { id: 'amanha', title: 'Amanhã', durationMinutes: 30, category: 'work' as const, deadline: '2026-09-15T09:00:00' },
    ];

    const rhythm = deriveTaskRhythm(mesmoDia, '2026-09-14');

    // Duas do mesmo dia: vence a de prazo mais cedo, e não a primeira da lista nem a primeira em ordem alfabética.
    expect(rhythm.next?.id).toBe('cedo');
    expect(rhythm.dueToday).toBe(2);
    expect(rhythm.withoutDeadline).toBe(1);
  })
})

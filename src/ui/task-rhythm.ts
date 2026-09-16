import type { Task } from '../domain/models'

export type TaskDeadlineState = 'overdue' | 'today' | 'future' | 'none'

export type TaskRhythm = Readonly<{
  next: Task | null
  open: number
  overdue: number
  dueToday: number
  withoutDeadline: number
  deadlineStateById: Readonly<Record<string, TaskDeadlineState>>
}>

const deadlineDay = (deadline?: string) => deadline?.slice(0, 10) ?? null
/** Aberta é o que não foi concluído nem pausado. A tela e o resumo contam pela mesma regra. */
export const isOpen = (task: Task) => task.status !== 'completed' && task.status !== 'paused'

export function deriveTaskRhythm(tasks: readonly Task[], today: string): TaskRhythm {
  const openTasks = tasks.filter(isOpen)
  const deadlineStateById = Object.fromEntries(openTasks.map((task) => {
    const day = deadlineDay(task.deadline)
    const state: TaskDeadlineState = !day ? 'none' : day < today ? 'overdue' : day === today ? 'today' : 'future'
    return [task.id, state]
  }))
  const priority = (task: Task) => ({ overdue: 0, today: 1, future: 2, none: 3 }[deadlineStateById[task.id]])
  const ordered = [...openTasks].sort((left, right) => priority(left) - priority(right) || (left.deadline ?? '').localeCompare(right.deadline ?? '') || left.title.localeCompare(right.title))

  return {
    next: ordered[0] ?? null,
    open: openTasks.length,
    overdue: ordered.filter((task) => deadlineStateById[task.id] === 'overdue').length,
    dueToday: ordered.filter((task) => deadlineStateById[task.id] === 'today').length,
    withoutDeadline: ordered.filter((task) => deadlineStateById[task.id] === 'none').length,
    deadlineStateById,
  }
}

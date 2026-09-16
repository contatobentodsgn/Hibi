import React from 'react'
import type { Task } from '../domain/models'
import { deriveTaskRhythm } from './task-rhythm'
import './tasks-atelier.css'

type Props = Readonly<{ tasks: readonly Task[]; today: string }>

export function TasksAtelierSummary({ tasks, today }: Props) {
  const rhythm = deriveTaskRhythm(tasks, today)

  return <section className="tasks-atelier-summary" aria-label="Task execution summary">
    <div className="task-next"><span>Next action</span><strong>{rhythm.next?.title ?? 'Your queue is clear'}</strong></div>
    <div><span>Overdue</span><strong>{rhythm.overdue}</strong></div>
    <div><span>Due today</span><strong>{rhythm.dueToday}</strong></div>
    <div><span>Without deadline</span><strong>{rhythm.withoutDeadline}</strong></div>
  </section>
}

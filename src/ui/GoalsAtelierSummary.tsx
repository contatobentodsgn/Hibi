import React from 'react';
import type { Goal } from '../domain/models';
import { deriveGoalsDirection } from './progress-rhythm';
import './progress-atelier.css';

export function GoalsAtelierSummary({ goals }: Readonly<{ goals: readonly Goal[] }>) {
  const direction = deriveGoalsDirection(goals);
  return <section className="progress-atelier-summary" aria-label="Goals direction summary">
    <div className="progress-atelier-lead"><span>Closest milestone</span><strong>{direction.next?.title ?? 'Choose your next goal'}</strong></div>
    <div><span>In progress</span><strong>{direction.active}</strong></div>
    <div><span>Complete</span><strong>{direction.completed} of {direction.total}</strong></div>
  </section>;
}

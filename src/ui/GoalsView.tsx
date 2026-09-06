import React from 'react';
import type { Goal, StudyData } from '../domain/models';

type GoalChanges = Partial<Omit<Goal, 'id'>>;
type Props = {
  data: StudyData;
  onCreate: (title: string, target: number, unit?: string) => void;
  onProgress: (id: string, current: number) => void;
  onUpdate: (id: string, changes: GoalChanges) => void;
  onDelete: (id: string) => void;
};

export function GoalsView({ data, onCreate, onProgress, onUpdate, onDelete }: Props) {
  return <div className="view goals-view">
    <div className="view-heading"><div><p className="eyebrow">DIRECTION LAYER</p><h1>Goals</h1><p className="muted">{data.goals.length} goals · make progress visible</p></div><button className="primary" onClick={() => {
      const title = window.prompt('Nome da meta');
      if (!title?.trim()) return;
      const targetInput = window.prompt('Alvo numérico', '10');
      const target = Number(targetInput);
      if (!Number.isFinite(target) || target <= 0) { window.alert('Informe um alvo maior que zero.'); return; }
      onCreate(title.trim(), target, window.prompt('Unidade (opcional)', '')?.trim() || undefined);
    }}>+ New goal</button></div>
    <section className="list-card">{data.goals.map((goal) => {
      const percent = Math.min(100, Math.round((goal.current / Math.max(goal.target, 1)) * 100));
      const completed = goal.status === 'completed' || goal.current >= goal.target;
      return <div className="goal-row" key={goal.id}>
        <div className="goal-copy"><div className="goal-title"><strong>{goal.title}</strong>{completed && <span className="pill green">Complete</span>}</div><span>{goal.current} / {goal.target}{goal.unit ? ` ${goal.unit}` : ''}</span><div className="entity-progress"><span style={{ width: `${percent}%` }} /></div></div>
        <button className="outline compact-action" aria-label={`Set progress for ${goal.title}`} onClick={() => { const value = window.prompt(`Progresso atual (0-${goal.target})`, String(goal.current)); if (value === null) return; const current = Number(value); if (Number.isFinite(current)) onProgress(goal.id, current); }}>Set progress</button>
        <button className="primary compact-action" aria-label={`Advance ${goal.title}`} onClick={() => onProgress(goal.id, goal.current + 1)} disabled={completed}>+1</button>
        <button className="icon-button" aria-label={`Edit ${goal.title}`} onClick={() => { const title = window.prompt('Nome da meta', goal.title); if (title?.trim() && title.trim() !== goal.title) onUpdate(goal.id, { title: title.trim() }); }}>✎</button>
        <button className="icon-button" aria-label={`Delete ${goal.title}`} onClick={() => { if (window.confirm(`Excluir ${goal.title}?`)) onDelete(goal.id); }}>×</button>
      </div>;
    })}{!data.goals.length && <div className="empty-state"><strong>No goals yet</strong><span>Choose an outcome worth moving toward and track it here.</span></div>}</section>
  </div>;
}

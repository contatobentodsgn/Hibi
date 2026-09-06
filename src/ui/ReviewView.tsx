import React from 'react';
import type { StudyData } from '../domain/models';
import { findReviewIssues } from '../domain/review';

export function ReviewView({ data, onNavigate }: { data: StudyData; onNavigate: (route: any) => void }) {
  const openTasks = data.tasks.filter((item) => item.status !== 'completed').length;
  const activeHabits = data.habits.filter((item) => item.status !== 'completed').length;
  const activeGoals = data.goals.filter((item) => item.status !== 'completed').length;
  const rows = [['Open tasks', openTasks, 'tasks'], ['Active habits', activeHabits, 'habits'], ['Goals in progress', activeGoals, 'goals'], ['Notes captured', data.notes.length, 'notes'], ['Scheduled blocks', data.blocks.length, 'week']] as const;
  const issues = findReviewIssues(data);
  return <div className="view"><div className="view-heading"><div><p className="eyebrow">REVIEW LAYER · LOCAL SNAPSHOT</p><h1>Review</h1><p className="muted">A focused review of your current workspace</p></div></div><div className="telemetry-summary">{rows.slice(0, 3).map(([label, count]) => <div key={label}><strong>{count}</strong><span>{label}</span></div>)}</div><section className="list-card">{rows.map(([label, count, route]) => <div className="task-row" key={label}><div><strong>{label}</strong><span>{count} items in the current snapshot</span></div><button className="outline" onClick={() => onNavigate(route)}>Open</button></div>)}</section><section className="list-card" aria-label="Review actions"><div className="task-row"><div><strong>Unscheduled open tasks · {issues.unscheduledTaskCount}</strong><span>Open tasks without a scheduled block</span></div><button className="outline" onClick={() => onNavigate('tasks')}>Review tasks</button></div><div className="task-row"><div><strong>Duplicate-looking scheduled blocks · {issues.duplicateBlockCount}</strong><span>Same-title blocks on the same day</span></div><button className="outline" onClick={() => onNavigate('week')}>Review schedule</button></div></section></div>;
}

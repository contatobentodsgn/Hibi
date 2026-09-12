import React, { useMemo, useState } from 'react';
import type { StudyData } from '../domain/models';
import { findReviewIssues, type ReviewSuggestion } from '../domain/review';
import './review-suggestions.css';

type Props = { data: StudyData; now?: Date; onNavigate: (route: any) => void };

const suggestionTitle = (suggestion: ReviewSuggestion): string => suggestion.kind === 'duplicate_task' ? 'Possible duplicate tasks' : 'Missing schedule';
const suggestionRoute = (suggestion: ReviewSuggestion): 'tasks' | 'week' => suggestion.kind === 'duplicate_task' ? 'tasks' : 'week';
const suggestionAction = (suggestion: ReviewSuggestion): string => suggestion.kind === 'duplicate_task' ? 'Review tasks' : 'Review schedule';

export function ReviewView({ data, now = new Date(), onNavigate }: Props) {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const openTasks = data.tasks.filter((item) => item.status !== 'completed').length;
  const activeHabits = data.habits.filter((item) => item.status !== 'completed').length;
  const activeGoals = data.goals.filter((item) => item.status !== 'completed').length;
  const rows = [['Open tasks', openTasks, 'tasks'], ['Active habits', activeHabits, 'habits'], ['Goals in progress', activeGoals, 'goals'], ['Notes captured', data.notes.length, 'notes'], ['Scheduled blocks', data.blocks.length, 'week']] as const;
  const issues = useMemo(() => findReviewIssues({ tasks: data.tasks, blocks: data.blocks, now }), [data.blocks, data.tasks, now]);
  const suggestions = issues.suggestions.filter((suggestion) => !dismissed.has(suggestion.id));
  const duplicateSuggestions = suggestions.filter((suggestion) => suggestion.kind === 'duplicate_task');
  const missingScheduleSuggestions = suggestions.filter((suggestion) => suggestion.kind === 'missing_schedule');
  const dismiss = (ids: readonly string[]) => setDismissed((current) => new Set([...current, ...ids]));

  return <div className="view">
    <div className="view-heading"><div><p className="eyebrow">REVIEW LAYER · LOCAL SNAPSHOT</p><h1>Review</h1><p className="muted">A focused review of your current workspace</p></div></div>
    <div className="telemetry-summary">{rows.slice(0, 3).map(([label, count]) => <div key={label}><strong>{count}</strong><span>{label}</span></div>)}</div>
    <section className="list-card">{rows.map(([label, count, route]) => <div className="task-row" key={label}><div><strong>{label}</strong><span>{count} items in the current snapshot</span></div><button className="outline" onClick={() => onNavigate(route)}>Open</button></div>)}</section>
    <section className="list-card" aria-label="Review actions"><div className="task-row"><div><strong>Unscheduled open tasks · {issues.unscheduledTaskCount}</strong><span>Open tasks without a scheduled block</span></div><button className="outline" onClick={() => onNavigate('tasks')}>Review tasks</button></div><div className="task-row"><div><strong>Duplicate-looking scheduled blocks · {issues.duplicateBlockCount}</strong><span>Same-title blocks on the same day</span></div><button className="outline" onClick={() => onNavigate('week')}>Review schedule</button></div></section>
    <section className="review-suggestions" aria-label="Review suggestions">
      <div className="review-suggestions-heading"><div><p className="eyebrow">ACTIONABLE REVIEW</p><h2>Suggestions</h2><p className="muted">Each suggestion is local, explainable, and never changes your workspace on its own.</p></div><div className="review-dismiss-actions">{duplicateSuggestions.length > 0 && <button className="outline" onClick={() => dismiss(duplicateSuggestions.map((suggestion) => suggestion.id))}>Dismiss all duplicate suggestions</button>}{missingScheduleSuggestions.length > 0 && <button className="outline" onClick={() => dismiss(missingScheduleSuggestions.map((suggestion) => suggestion.id))}>Dismiss all missing schedule suggestions</button>}</div></div>
      {suggestions.length === 0 ? <p className="review-empty" role="status">No action needs your attention right now.</p> : <div className="review-suggestion-list">{suggestions.map((suggestion) => <article className="review-suggestion" key={suggestion.id} data-review-suggestion={suggestion.id} aria-label={suggestionTitle(suggestion)}><div className="review-suggestion-copy"><div className="review-suggestion-title"><strong>{suggestionTitle(suggestion)}</strong><span className="review-confidence">{suggestion.confidence} confidence</span></div><p>{suggestion.evidence.join(' · ')}</p><small>{suggestion.taskIds.length} {suggestion.taskIds.length === 1 ? 'task' : 'tasks'} involved</small></div><div className="review-suggestion-actions"><button className="outline" onClick={() => onNavigate(suggestionRoute(suggestion))}>{suggestionAction(suggestion)}</button><button className="text-button" aria-label={`Dismiss ${suggestionTitle(suggestion).toLocaleLowerCase()}`} onClick={() => dismiss([suggestion.id])}>Dismiss</button></div></article>)}</div>}
    </section>
  </div>;
}

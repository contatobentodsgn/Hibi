import React, { useMemo, useState } from 'react';
import type { ScheduleBlock, StudyData } from '../domain/models';
import { findReviewIssues, type ReviewSuggestion } from '../domain/review';
import { findFreeSlot } from '../domain/review-slot';
import { useT } from '../i18n/LocaleProvider';
import { readDismissedSuggestions, writeDismissedSuggestions } from './review-dismissals';
import { HibiUiRoot } from './redesign/components/HibiUiRoot';
import { SectionHeader } from './redesign/components/SectionHeader';
import './review-suggestions.css';

type Props = { data: StudyData; now?: Date; onNavigate: (route: any) => void; onCreateBlock?: (input: Omit<ScheduleBlock, 'id'>) => void; storage?: Pick<Storage, 'getItem' | 'setItem'> };
const browserStorage = () => { try { return window.localStorage; } catch { return undefined; } };

const suggestionTitle = (suggestion: ReviewSuggestion): string => suggestion.kind === 'duplicate_task' ? 'Possible duplicate tasks' : 'Missing schedule';
const suggestionRoute = (suggestion: ReviewSuggestion): 'tasks' | 'week' => suggestion.kind === 'duplicate_task' ? 'tasks' : 'week';
const suggestionAction = (suggestion: ReviewSuggestion): string => suggestion.kind === 'duplicate_task' ? 'Review tasks' : 'Review schedule';

export function ReviewView({ data, now = new Date(), onNavigate, onCreateBlock, storage = browserStorage() }: Props) {
  const t = useT();
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => readDismissedSuggestions(storage));
  const [scheduleNotice, setScheduleNotice] = useState<string | null>(null);
  const openTasks = data.tasks.filter((item) => item.status !== 'completed').length;
  const activeHabits = data.habits.filter((item) => item.status !== 'completed').length;
  const activeGoals = data.goals.filter((item) => item.status !== 'completed').length;
  const rows = [['Open tasks', openTasks, 'tasks'], ['Active habits', activeHabits, 'habits'], ['Goals in progress', activeGoals, 'goals'], ['Notes captured', data.notes.length, 'notes'], ['Scheduled blocks', data.blocks.length, 'week']] as const;
  const issues = useMemo(() => findReviewIssues({ tasks: data.tasks, blocks: data.blocks, now }), [data.blocks, data.tasks, now]);
  const suggestions = issues.suggestions.filter((suggestion) => !dismissed.has(suggestion.id));
  const duplicateSuggestions = suggestions.filter((suggestion) => suggestion.kind === 'duplicate_task');
  const missingScheduleSuggestions = suggestions.filter((suggestion) => suggestion.kind === 'missing_schedule');
  const dismiss = (ids: readonly string[]) => setDismissed((current) => { const next = new Set([...current, ...ids]); writeDismissedSuggestions(storage, next); return next; });
  // "Sem agenda" só se resolve com um bloco ligado à tarefa, e nenhuma tela criava esse vínculo: a
  // sugestão reserva o primeiro horário livre até o prazo.
  const scheduleTask = (suggestion: ReviewSuggestion) => {
    const task = data.tasks.find((item) => item.id === suggestion.taskIds[0]);
    if (!task || !onCreateBlock) return;
    const deadlineDay = task.deadline?.slice(0, 10) ?? '';
    const slot = findFreeSlot({ blocks: data.blocks, durationMinutes: task.durationMinutes, now, lastDay: deadlineDay });
    if (!slot) { setScheduleNotice(t('reviewAction.noSlot').replace('{title}', () => task.title)); return; }
    onCreateBlock({ title: task.title, start: slot.start, end: slot.end, category: task.category, taskId: task.id });
    setScheduleNotice(t('reviewAction.scheduled').replace('{title}', () => task.title).replace('{when}', `${slot.start.slice(8, 10)}/${slot.start.slice(5, 7)} ${slot.start.slice(11, 16)}–${slot.end.slice(11, 16)}`));
  };

  return <HibiUiRoot className="review-screen">
    <SectionHeader title={t('review.title')} subtitle={t('review.subtitle')} />
    <div className="telemetry-summary">{rows.slice(0, 3).map(([label, count]) => <div key={label}><strong>{count}</strong><span>{label}</span></div>)}</div>
    <section className="list-card">{rows.map(([label, count, route]) => <div className="task-row" key={label}><div><strong>{label}</strong><span>{count} items in the current snapshot</span></div><button className="outline" onClick={() => onNavigate(route)}>Open</button></div>)}</section>
    <section className="list-card" aria-label="Review actions"><div className="task-row"><div><strong>Unscheduled open tasks · {issues.unscheduledTaskCount}</strong><span>Open tasks without a scheduled block</span></div><button className="outline" onClick={() => onNavigate('tasks')}>Review tasks</button></div><div className="task-row"><div><strong>Duplicate-looking scheduled blocks · {issues.duplicateBlockCount}</strong><span>Same-title blocks on the same day</span></div><button className="outline" onClick={() => onNavigate('week')}>Review schedule</button></div></section>
    <section className="review-suggestions" aria-label="Review suggestions">
      <div className="review-suggestions-heading"><div><p className="eyebrow">ACTIONABLE REVIEW</p><h2>Suggestions</h2><p className="muted">Each suggestion is local, explainable, and never changes your workspace on its own.</p></div><div className="review-dismiss-actions">{duplicateSuggestions.length > 0 && <button className="outline" onClick={() => dismiss(duplicateSuggestions.map((suggestion) => suggestion.id))}>Dismiss all duplicate suggestions</button>}{missingScheduleSuggestions.length > 0 && <button className="outline" onClick={() => dismiss(missingScheduleSuggestions.map((suggestion) => suggestion.id))}>Dismiss all missing schedule suggestions</button>}</div></div>
      {scheduleNotice && <p className="review-schedule-notice muted" role="status">{scheduleNotice}</p>}
      {suggestions.length === 0 ? <p className="review-empty" role="status">No action needs your attention right now.</p> : <div className="review-suggestion-list">{suggestions.map((suggestion) => <article className="review-suggestion" key={suggestion.id} data-review-suggestion={suggestion.id} aria-label={suggestionTitle(suggestion)}><div className="review-suggestion-copy"><div className="review-suggestion-title"><strong>{suggestionTitle(suggestion)}</strong><span className="review-confidence">{suggestion.confidence} confidence</span></div><p>{suggestion.evidence.join(' · ')}</p><small>{suggestion.taskIds.length} {suggestion.taskIds.length === 1 ? 'task' : 'tasks'} involved</small></div><div className="review-suggestion-actions">{suggestion.kind === 'missing_schedule' && onCreateBlock && <button className="primary" onClick={() => scheduleTask(suggestion)}>{t('reviewAction.schedule')}</button>}<button className="outline" onClick={() => onNavigate(suggestionRoute(suggestion))}>{suggestionAction(suggestion)}</button><button className="text-button" aria-label={`Dismiss ${suggestionTitle(suggestion).toLocaleLowerCase()}`} onClick={() => dismiss([suggestion.id])}>Dismiss</button></div></article>)}</div>}
    </section>
  </HibiUiRoot>;
}

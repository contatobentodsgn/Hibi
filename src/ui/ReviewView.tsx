import React, { useMemo, useState } from 'react';
import { ClipboardCheck, Lightbulb, Sparkles } from 'lucide-react';
import { Button, Card } from '@heroui/react';
import type { ScheduleBlock, StudyData } from '../domain/models';
import { findReviewIssues, type ReviewSuggestion } from '../domain/review';
import { findFreeSlot } from '../domain/review-slot';
import { useT } from '../i18n/LocaleProvider';
import { readDismissedSuggestions, writeDismissedSuggestions } from './review-dismissals';
import { HibiUiRoot } from './redesign/components/HibiUiRoot';
import { SectionHeader } from './redesign/components/SectionHeader';
import { HibiEmptyState } from './redesign/components/HibiEmptyState';
import { HibiTag } from './redesign/components/HibiTag';
import './review-suggestions.css';
import './redesign/screens/review-screen.css';

type Props = { data: StudyData; now?: Date; onNavigate: (route: any) => void; onCreateBlock?: (input: Omit<ScheduleBlock, 'id'>) => void; storage?: Pick<Storage, 'getItem' | 'setItem'> };
const browserStorage = () => { try { return window.localStorage; } catch { return undefined; } };

const suggestionTitle = (suggestion: ReviewSuggestion, t: (key: import('../i18n/dictionary').DictionaryKey) => string): string => {
  const key = suggestion.kind === 'duplicate_task' ? 'review.duplicates' : 'review.unscheduled';
  return t(key).replace('{count}', String(suggestion.taskIds.length));
};
const suggestionRoute = (suggestion: ReviewSuggestion): 'tasks' | 'week' => suggestion.kind === 'duplicate_task' ? 'tasks' : 'week';
const suggestionAction = (suggestion: ReviewSuggestion, t: (key: import('../i18n/dictionary').DictionaryKey) => string): string => suggestion.kind === 'duplicate_task' ? t('review.reviewTasks') : t('review.reviewSchedule');

export function ReviewView({ data, now = new Date(), onNavigate, onCreateBlock, storage = browserStorage() }: Props) {
  const t = useT();
  const text = (key: import('../i18n/dictionary').DictionaryKey, values: Record<string, string | number> = {}) => Object.entries(values).reduce((value, [name, replacement]) => value.replace(`{${name}}`, String(replacement)), t(key));
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => readDismissedSuggestions(storage));
  const [scheduleNotice, setScheduleNotice] = useState<string | null>(null);
  const openTasks = data.tasks.filter((item) => item.status !== 'completed').length;
  const activeHabits = data.habits.filter((item) => item.status !== 'completed').length;
  const activeGoals = data.goals.filter((item) => item.status !== 'completed').length;
  const rows = [[t('review.openTasks'), openTasks, 'tasks'], [t('review.activeHabits'), activeHabits, 'habits'], [t('review.goalsProgress'), activeGoals, 'goals'], [t('review.notesCaptured'), data.notes.length, 'notes'], [t('review.scheduledBlocks'), data.blocks.length, 'week']] as const;
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
    <div className="review-summary-grid">{rows.slice(0, 3).map(([label, count]) => <Card className="review-metric" key={label}><strong>{count}</strong><span>{label}</span></Card>)}</div>
    <Card className="review-snapshot"><div className="review-card-heading"><div><HibiTag tone="lavender">{t('review.snapshot')}</HibiTag><h2>{t('review.snapshotTitle')}</h2></div><ClipboardCheck aria-hidden="true" size={22} /></div>{rows.map(([label, count, route]) => <div className="review-row" key={label}><div><strong>{label}</strong><span>{text('review.currentSnapshot', { count })}</span></div><Button variant="secondary" onPress={() => onNavigate(route)}>{t('review.open')}</Button></div>)}</Card>
    <Card className="review-actions-card" aria-label={t('review.actions')}><div className="review-card-heading"><div><HibiTag tone="mint">{t('review.actions')}</HibiTag><h2>{t('review.actionsTitle')}</h2></div><Lightbulb aria-hidden="true" size={22} /></div><div className="review-action-grid"><div><strong>{text('review.unscheduled', { count: issues.unscheduledTaskCount })}</strong><span>{t('review.unscheduledDetail')}</span><Button variant="secondary" onPress={() => onNavigate('tasks')}>{t('review.reviewTasks')}</Button></div><div><strong>{text('review.duplicates', { count: issues.duplicateBlockCount })}</strong><span>{t('review.duplicatesDetail')}</span><Button variant="secondary" onPress={() => onNavigate('week')}>{t('review.reviewSchedule')}</Button></div></div></Card>
    <section className="review-suggestions" aria-label={t('review.suggestions')}>
      <div className="review-suggestions-heading"><div><p className="eyebrow">{t('review.suggestionsEyebrow')}</p><h2>{t('review.suggestions')}</h2><p className="muted">{t('review.suggestionsDetail')}</p></div><div className="review-dismiss-actions">{duplicateSuggestions.length > 0 && <button className="outline" onClick={() => dismiss(duplicateSuggestions.map((suggestion) => suggestion.id))}>{t('review.dismissDuplicates')}</button>}{missingScheduleSuggestions.length > 0 && <button className="outline" onClick={() => dismiss(missingScheduleSuggestions.map((suggestion) => suggestion.id))}>{t('review.dismissMissing')}</button>}</div></div>
      {scheduleNotice && <p className="review-schedule-notice muted" role="status">{scheduleNotice}</p>}
      {suggestions.length === 0 ? <p className="review-empty" role="status">{t('review.empty')}</p> : <div className="review-suggestion-list">{suggestions.map((suggestion) => <article className="review-suggestion" key={suggestion.id} data-review-suggestion={suggestion.id} aria-label={suggestionTitle(suggestion, t)}><div className="review-suggestion-copy"><div className="review-suggestion-title"><strong>{suggestionTitle(suggestion, t)}</strong><span className="review-confidence">{text('review.confidence', { confidence: suggestion.confidence })}</span></div><p>{suggestion.evidence.join(' · ')}</p><small>{text('review.tasksInvolved', { count: suggestion.taskIds.length })}</small></div><div className="review-suggestion-actions">{suggestion.kind === 'missing_schedule' && onCreateBlock && <button className="primary" onClick={() => scheduleTask(suggestion)}>{t('reviewAction.schedule')}</button>}<button className="outline" onClick={() => onNavigate(suggestionRoute(suggestion))}>{suggestionAction(suggestion, t)}</button><button className="text-button" aria-label={`${t('review.dismiss')} ${suggestionTitle(suggestion, t).toLocaleLowerCase()}`} onClick={() => dismiss([suggestion.id])}>{t('review.dismiss')}</button></div></article>)}</div>}
    </section>
  </HibiUiRoot>;
}

import { localDateKey, localNoon, shiftDayKey, todayKey } from './date-context';
import type { ScheduleBlock, Task } from './models';

export type ReviewSuggestionKind = 'duplicate_task' | 'missing_schedule';

export interface ReviewSuggestion {
  id: string;
  kind: ReviewSuggestionKind;
  taskIds: string[];
  evidence: string[];
  confidence: 'high';
}

export interface ReviewIssues {
  unscheduledTasks: Task[];
  unscheduledTaskCount: number;
  duplicateBlockGroups: ScheduleBlock[][];
  duplicateBlockCount: number;
  suggestions: ReviewSuggestion[];
}

const normalizeText = (value: string | undefined): string => (value ?? '').trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').toLocaleLowerCase();
const dayFromDeadline = (deadline: string | undefined): string | null => {
  const day = deadline?.slice(0, 10);
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return localDateKey(localNoon(day)) === day ? day : null;
};
const taskGroupKey = (task: Task): string => [normalizeText(task.title), normalizeText(task.folder), task.category, task.durationMinutes, task.deadline ?? ''].join('\u0000');
const suggestionId = (kind: ReviewSuggestionKind, taskIds: readonly string[]): string => `${kind}:${[...taskIds].sort().join(':')}`;

export function findReviewSuggestions({ tasks, blocks, now = new Date() }: ReviewIssuesInput): ReviewSuggestion[] {
  const scheduledTaskIds = new Set(blocks.flatMap((block) => block.taskId ? [block.taskId] : []));
  const openTasks = tasks.filter((task) => task.status !== 'completed' && task.status !== 'paused');
  const duplicateGroups = new Map<string, Task[]>();
  for (const task of openTasks) {
    const key = taskGroupKey(task);
    const group = duplicateGroups.get(key) ?? [];
    group.push(task);
    duplicateGroups.set(key, group);
  }

  const duplicates = [...duplicateGroups.values()]
    .filter((group) => group.length > 1 && !group.every((task) => scheduledTaskIds.has(task.id)))
    .map((group): ReviewSuggestion => {
      const ordered = [...group].sort((a, b) => a.id.localeCompare(b.id));
      const first = ordered[0];
      const evidence = ['same title', 'same folder', 'same duration'];
      if (first.deadline) evidence.push('same deadline');
      else evidence.push('no deadline on either task');
      return { id: suggestionId('duplicate_task', ordered.map((task) => task.id)), kind: 'duplicate_task', taskIds: ordered.map((task) => task.id), evidence, confidence: 'high' };
    });

  // Resolver uma possível cópia vem antes de reservar horário: mostrar os dois
  // tipos para a mesma tarefa faria o Review pedir duas decisões contraditórias.
  const duplicateTaskIds = new Set(duplicates.flatMap((suggestion) => suggestion.taskIds));
  const latestUrgentDay = shiftDayKey(todayKey(now), 7);
  const missingSchedules = openTasks
    .filter((task) => task.durationMinutes > 0 && !scheduledTaskIds.has(task.id) && !duplicateTaskIds.has(task.id))
    .flatMap((task): ReviewSuggestion[] => {
      const deadline = dayFromDeadline(task.deadline);
      if (!deadline || deadline > latestUrgentDay) return [];
      return [{ id: suggestionId('missing_schedule', [task.id]), kind: 'missing_schedule', taskIds: [task.id], evidence: [`${task.durationMinutes} min`, `deadline ${deadline}`], confidence: 'high' }];
    });

  return [...duplicates, ...missingSchedules].sort((a, b) => a.id.localeCompare(b.id));
}

export function findReviewIssues({ tasks, blocks, now = new Date() }: ReviewIssuesInput): ReviewIssues {
  const scheduledTaskIds = new Set(blocks.map((block) => block.taskId).filter(Boolean));
  const unscheduledTasks = tasks.filter((task) => task.status !== 'completed' && !scheduledTaskIds.has(task.id));
  const byTitleAndDate = new Map<string, ScheduleBlock[]>();

  for (const block of blocks) {
    const key = `${block.start.slice(0, 10)}\u0000${block.title.trim().toLocaleLowerCase()}`;
    const group = byTitleAndDate.get(key) ?? [];
    group.push(block);
    byTitleAndDate.set(key, group);
  }

  const duplicateBlockGroups = [...byTitleAndDate.values()].filter((group) => group.length > 1);
  return {
    unscheduledTasks,
    unscheduledTaskCount: unscheduledTasks.length,
    duplicateBlockGroups,
    duplicateBlockCount: duplicateBlockGroups.reduce((count, group) => count + group.length, 0),
    suggestions: findReviewSuggestions({ tasks, blocks, now }),
  };
}

type ReviewIssuesInput = { tasks: Task[]; blocks: ScheduleBlock[]; now?: Date };

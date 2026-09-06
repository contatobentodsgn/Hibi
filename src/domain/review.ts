import type { ScheduleBlock, Task } from './models';

export interface ReviewIssues {
  unscheduledTasks: Task[];
  unscheduledTaskCount: number;
  duplicateBlockGroups: ScheduleBlock[][];
  duplicateBlockCount: number;
}

export function findReviewIssues({ tasks, blocks }: Pick<ReviewIssuesInput, 'tasks' | 'blocks'>): ReviewIssues {
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
  };
}

type ReviewIssuesInput = { tasks: Task[]; blocks: ScheduleBlock[] };

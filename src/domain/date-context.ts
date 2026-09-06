import type { StudyData } from './models';

export function referenceDate(data: StudyData): string {
  const dates = data.blocks.map((block) => block.start.slice(0, 10)).filter(Boolean).sort();
  return dates[0] ?? new Date().toISOString().slice(0, 10);
}

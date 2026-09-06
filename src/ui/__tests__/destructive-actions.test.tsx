import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const views = ['TasksView', 'HabitsView', 'GoalsView'];

describe('destructive view actions', () => {
  it.each(views)('%s defines an explicit accessible delete confirmation flow', async (view) => {
    const source = await readFile(new URL(`../${view}.tsx`, import.meta.url), 'utf8');
    expect(source).not.toContain('window.confirm');
    expect(source).toContain('role="dialog"');
    expect(source).toContain('Confirm delete');
    expect(source).toContain('Cancel');
  });
});

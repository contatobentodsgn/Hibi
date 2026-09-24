import { expect, test } from '@playwright/test';

test('a task next-step suggestion acts on deadlines and its dismissal survives reload', async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 8, 24, 10, 0, 0) });
  await page.goto('/');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('hibi-study-data') ?? '{}');
    data.tasks[0].deadline = '2026-09-20T09:00:00';
    localStorage.setItem('hibi-study-data', JSON.stringify(data));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Tarefas', exact: true }).click();

  const suggestion = page.locator('[data-contextual-guidance="tasks.overdue"]');
  await expect(suggestion).toBeVisible();
  await suggestion.getByRole('button', { name: 'Revisar prazos' }).click();
  await expect(suggestion).toHaveCount(0);
  await expect(page.locator('.tasks-screen__list-header').getByRole('button')).toContainText('Por criação');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('pixano.contextual-guidance.dismissed.v1'))).toContain('tasks.overdue');

  await page.reload();
  await page.getByRole('button', { name: 'Tarefas', exact: true }).click();
  await expect(page.locator('[data-contextual-guidance="tasks.overdue"]')).toHaveCount(0);
});

test('dismissing a next-step suggestion hides it without changing workspace data', async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 8, 24, 10, 0, 0) });
  await page.goto('/');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('hibi-study-data') ?? '{}');
    data.tasks[0].deadline = '2026-09-20T09:00:00';
    localStorage.setItem('hibi-study-data', JSON.stringify(data));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Tarefas', exact: true }).click();

  const suggestion = page.locator('[data-contextual-guidance="tasks.overdue"]');
  await expect(suggestion).toBeVisible();
  const tasksBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('hibi-study-data') ?? '{}').tasks);
  await suggestion.getByRole('button', { name: 'Dispensar sugestão' }).click();

  await expect(suggestion).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hibi-study-data') ?? '{}').tasks)).toEqual(tasksBefore);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('pixano.contextual-guidance.dismissed.v1'))).toContain('tasks.overdue');
});

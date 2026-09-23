import { expect, test } from '@playwright/test';

const reviewSeedTime = new Date(2026, 8, 12, 12, 0, 0);

test('review suggestions can be dismissed without mutating workspace data', async ({ page }) => {
  await page.clock.install({ time: reviewSeedTime });
  await page.goto('/');

  await page.evaluate(() => {
    const data = JSON.parse(window.localStorage.getItem('hibi-study-data') ?? '{}');
    data.tasks = [];
    data.blocks = [];
    data.tasks.push(
      { id: 'review-duplicate-a', title: 'Follow up café', durationMinutes: 45, category: 'important', folder: 'Bento', deadline: '2026-09-14T10:00:00-03:00' },
      { id: 'review-duplicate-b', title: ' follow up cafe ', durationMinutes: 45, category: 'important', folder: 'Bento', deadline: '2026-09-14T10:00:00-03:00' },
      { id: 'review-urgent', title: 'Confirm delivery', durationMinutes: 60, category: 'important', folder: 'Bento', deadline: '2026-09-15T10:00:00-03:00' },
    );
    window.localStorage.setItem('hibi-study-data', JSON.stringify(data));
  });
  await page.reload();
  const workspaceBeforeDismissal = await page.evaluate(() => window.localStorage.getItem('hibi-study-data'));

  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Revisão', exact: true }).click();

  const suggestions = page.getByRole('region', { name: 'Sugestões' });
  await expect(suggestions).toBeVisible();
  const duplicate = suggestions.locator('[data-review-suggestion="duplicate_task:review-duplicate-a:review-duplicate-b"]');
  await expect(duplicate).toContainText('Blocos agendados possivelmente duplicados');
  await expect(suggestions.getByText(/Tarefas abertas sem agenda/).first()).toBeVisible();

  await duplicate.getByRole('button', { name: 'Dispensar blocos agendados possivelmente duplicados · 2' }).click();
  await expect(duplicate).toHaveCount(0);
  await expect(suggestions.getByText(/Tarefas abertas sem agenda/).first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('hibi-study-data'))).toBe(workspaceBeforeDismissal);

  await suggestions.getByRole('button', { name: 'Dispensar todas as sugestões sem agenda' }).click();
  await expect(suggestions.getByRole('status')).toHaveText('Nada precisa da sua atenção agora.');
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('hibi-study-data'))).toBe(workspaceBeforeDismissal);
});

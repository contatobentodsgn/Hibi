import { expect, test } from '@playwright/test';

test('Reminders keeps its attention summary while filtering', async ({ page }) => {
  await page.goto('/');
  const dock = page.getByRole('navigation', { name: 'Navegação principal' });
  await dock.getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Lembretes', exact: true }).click();
  const summary = page.getByRole('region', { name: 'Reminder attention summary', exact: true });
  await expect(summary).toBeVisible();
  await page.getByRole('button', { name: /Important \d+/ }).click();
  await expect(summary).toBeVisible();
  await expect(page.getByRole('button', { name: /Important \d+/ })).toHaveAttribute('aria-pressed', 'true');
});

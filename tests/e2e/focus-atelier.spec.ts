import { expect, test } from '@playwright/test';

test('Focus keeps its session context when a local session starts', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Foco', exact: true }).click();
  const summary = page.getByRole('region', { name: 'Focus session summary', exact: true });
  await expect(summary).toBeVisible();
  await page.getByRole('button', { name: 'Start focus' }).click();
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('In progress');
});

import { test, expect } from '@playwright/test';

test('navega pelo calendário e abre comandos', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Make room for')).toBeVisible();
  await page.getByRole('button', { name: 'Week' }).click();
  await expect(page.getByText('Mon 07 — Sun 13')).toBeVisible();
  await page.keyboard.press('Meta+K');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
});

test('todas as seções principais são navegáveis', async ({ page }) => {
  await page.goto('/');
  for (const section of ['Tasks', 'Notes', 'Reminders', 'Habits', 'Goals', 'Review', 'Taby', 'Help', 'Day', 'Week', 'Focus', 'Settings', 'Events']) {
    await page.getByRole('button', { name: section, exact: true }).click();
    await expect(page.locator('main')).toBeVisible();
  }
});

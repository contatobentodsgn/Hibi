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

test('paleta de comandos permite navegação por teclado', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /commands/ }).click();
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();
  const input = palette.locator('input');
  await input.fill('/week');
  await expect(palette.getByRole('button', { name: /Open weekly schedule/ })).toHaveAttribute('data-selected', 'true');
  await input.press('Enter');
  await expect(page.getByText('Mon 07 — Sun 13')).toBeVisible();
});

test('atalho barra abre comandos fora de campos de texto', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true })));
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
});

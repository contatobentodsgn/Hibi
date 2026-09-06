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

test('captura rápida da Home abre a paleta de comandos', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open quick capture' }).click();
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
});

test('filtro Bento funciona em Tasks e Notes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await page.getByRole('button', { name: 'Folder · Bento' }).click();
  await expect(page.getByText('Kabrito Post 01')).toBeVisible();
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await page.getByRole('button', { name: 'Folder · Bento' }).click();
  await expect(page.locator('main')).toBeVisible();
});

test('abas de Settings alternam conteúdo funcional', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'General' })).toBeVisible();
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send test notification' })).toBeVisible();
  await page.getByRole('button', { name: 'Data', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Data' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset study data' })).toBeVisible();
});

test('navegação diária e semanal atualiza o período', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Day', exact: true }).click();
  await expect(page.getByText('MONDAY · 07 SEPTEMBER 2026')).toBeVisible();
  await page.getByRole('button', { name: 'Next day' }).click();
  await expect(page.getByText('TUESDAY · SEPTEMBER 08, 2026')).toBeVisible();
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await expect(page.getByText('Mon 07 — Sun 13')).toBeVisible();
  await page.getByRole('button', { name: 'Next week' }).click();
  await expect(page.getByText('Mon 14 — Sun 20')).toBeVisible();
});

test('filtros de lembretes alteram a lista', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Reminders', exact: true }).click();
  await expect(page.getByText('vaga/inglês - Horizontes')).toBeVisible();
  await page.getByRole('button', { name: /Wellbeing 0/ }).click();
  await expect(page.getByText('No reminders match this filter.')).toBeVisible();
  await page.getByRole('button', { name: /All 1/ }).click();
  await expect(page.getByText('vaga/inglês - Horizontes')).toBeVisible();
});

test('filtros e ordenação de Tasks são interativos', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await page.getByRole('button', { name: /All 8/ }).click();
  await expect(page.getByRole('button', { name: /All 8/ })).toHaveClass(/active/);
  await page.getByRole('button', { name: /Deadline/ }).click();
  await expect(page.getByRole('button', { name: /Deadline/ })).toHaveClass(/active/);
});

test('filtros do calendário usam as categorias reais dos blocos', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await page.getByRole('button', { name: 'Wellbeing', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete Almoço' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Important', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete Aula de inglês' }).first()).toBeVisible();
});

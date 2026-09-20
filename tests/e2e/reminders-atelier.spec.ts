import { expect, test } from '@playwright/test';

test('Lembretes mantém o resumo do próximo cuidado ao filtrar', async ({ page }) => {
  await page.goto('/');
  const dock = page.getByRole('navigation', { name: 'Navegação principal' });
  await dock.getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Lembretes', exact: true }).click();
  const summary = page.locator('.reminders-screen__summary');
  await expect(summary).toBeVisible();
  await page.getByRole('button', { name: /Importantes/ }).click();
  await expect(summary).toBeVisible();
  await expect(page.getByRole('button', { name: /Importantes/ })).toHaveAttribute('aria-pressed', 'true');
});

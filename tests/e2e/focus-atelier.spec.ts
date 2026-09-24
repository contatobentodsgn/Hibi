import { expect, test } from '@playwright/test';

test('Foco mantém o contexto da sessão quando um foco local começa', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Foco', exact: true }).click();
  const summary = page.getByRole('region', { name: 'Resumo da sessão de foco', exact: true });
  await expect(summary).toBeVisible();
  await page.getByRole('button', { name: 'Começar foco' }).click();
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('Em andamento');
});

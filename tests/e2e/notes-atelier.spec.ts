import { expect, test } from '@playwright/test';

test('Notas mantém o resumo de captura após adicionar uma nota', async ({ page }) => {
  await page.goto('/');
  const dock = page.getByRole('navigation', { name: 'Navegação principal' });
  await dock.getByRole('button', { name: 'Notas', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Resumo das notas' })).toBeVisible();

  await page.getByRole('textbox', { name: 'Título' }).fill('Nota de planejamento');
  await page.getByRole('button', { name: 'Adicionar nota' }).click();

  await expect(page.locator('.list-card').getByText('Nota de planejamento')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Resumo das notas' })).toBeVisible();
});

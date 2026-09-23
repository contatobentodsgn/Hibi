import { expect, test } from '@playwright/test';

test('a no-match notes state explains itself and restores the list', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Notas', exact: true }).click();
  await page.getByRole('textbox', { name: 'Pesquisar notas' }).fill('sem correspondência');

  await expect(page.getByText('Nenhuma nota encontrada')).toBeVisible();
  await page.getByRole('button', { name: 'Mostrar todas as notas', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Pesquisar notas' })).toHaveValue('');
});

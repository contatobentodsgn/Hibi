import { expect, test, type Page } from '@playwright/test';

const dock = (page: Page) => page.locator('.dock');

async function openSettings(page: Page) {
  await page.goto('/');
  await dock(page).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Ajustes', exact: true }).click();
}

test('persiste o tint escolhido e aplica-o ao documento', async ({ page }) => {
  await openSettings(page);
  const options = page.getByRole('radiogroup', { name: 'Cor de destaque' });
  const ocean = options.getByRole('radio', { name: 'Oceano' });

  await ocean.click();
  await expect(ocean).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-tint', 'ocean');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-tint', 'ocean');
});

import { expect, test } from '@playwright/test';

test('Notes keeps its capture summary after adding a note', async ({ page }) => {
  await page.goto('/');
  const dock = page.getByRole('navigation', { name: 'Navegação principal' });
  await dock.getByRole('button', { name: 'Notas', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Notes capture summary' })).toBeVisible();

  await page.getByRole('textbox', { name: 'Title' }).fill('Planning note');
  await page.getByRole('button', { name: 'Add note' }).click();

  await expect(page.locator('.list-card').getByText('Planning note')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Notes capture summary' })).toBeVisible();
});

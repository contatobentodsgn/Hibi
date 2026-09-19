import { expect, test } from '@playwright/test';

test('a no-match notes state explains itself and restores the list', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Notas', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search notes' }).fill('sem correspondência');

  const state = page.getByRole('status');
  await expect(state).toContainText('No notes match');
  await state.getByRole('button', { name: 'Show all notes', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Search notes' })).toHaveValue('');
});

import { expect, test } from '@playwright/test';

async function openMore(page: import('@playwright/test').Page, name: string) {
  const dock = page.getByRole('navigation', { name: 'Navegação principal' });
  await dock.getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}

test('Habits and Goals retain their progress context after creation', async ({ page }) => {
  await page.goto('/');
  await openMore(page, 'Hábitos');
  await expect(page.getByRole('region', { name: 'Habits rhythm summary', exact: true })).toBeVisible();
  await page.getByLabel('New habit title').fill('Read');
  await page.getByRole('button', { name: 'Add habit' }).click();
  await expect(page.getByRole('region', { name: 'Habits rhythm summary', exact: true })).toBeVisible();

  await openMore(page, 'Metas');
  await expect(page.getByRole('region', { name: 'Goals direction summary', exact: true })).toBeVisible();
  await page.getByLabel('New goal title').fill('Ship');
  await page.getByRole('button', { name: 'Add goal' }).click();
  await expect(page.getByRole('region', { name: 'Goals direction summary', exact: true })).toBeVisible();
});

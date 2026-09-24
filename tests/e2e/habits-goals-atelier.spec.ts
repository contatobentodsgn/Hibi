import { expect, test } from '@playwright/test';

async function openMore(page: import('@playwright/test').Page, name: string) {
  const dock = page.getByRole('navigation', { name: 'Navegação principal' });
  await dock.getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}

test('Hábitos e Metas mantêm o contexto de progresso após a criação', async ({ page }) => {
  await page.goto('/');
  await openMore(page, 'Hábitos');
  await expect(page.getByRole('region', { name: 'Rotina', exact: true })).toBeVisible();
  await page.getByLabel('Nome do hábito').fill('Ler');
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Rotina', exact: true })).toBeVisible();

  await openMore(page, 'Metas');
  await expect(page.getByRole('region', { name: 'Progresso', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Nova meta' }).click();
  await page.getByLabel('Nome da meta').fill('Publicar Pixano');
  await page.getByRole('spinbutton', { name: 'Alvo' }).fill('1');
  await page.getByRole('button', { name: 'Criar meta' }).click();
  await expect(page.getByRole('region', { name: 'Progresso', exact: true })).toBeVisible();
});

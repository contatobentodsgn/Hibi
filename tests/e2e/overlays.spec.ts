import { test, expect, type Page } from '@playwright/test';

const dock = (page: Page) => page.getByRole('navigation', { name: 'Navegação principal' });
const go = (page: Page, name: string) => dock(page).getByRole('button', { name, exact: true }).click();
const palette = (page: Page) => page.getByRole('dialog', { name: 'Paleta de comandos' });

const openTaskCreateModal = async (page: Page) => {
  await go(page, 'Tarefas');
  await page.getByRole('button', { name: 'Nova tarefa' }).click();
};

test('⌘K não abre a paleta por cima do modal de nova tarefa', async ({ page }) => {
  await page.goto('/');
  await openTaskCreateModal(page);
  const modal = page.getByRole('dialog', { name: 'O próximo passo.' });
  await expect(modal).toBeVisible();
  const title = modal.getByRole('textbox', { name: 'Título da tarefa' });
  await title.fill('Rascunho no modal');

  await page.keyboard.press('Meta+K');
  await expect(palette(page)).toHaveCount(0);
  await expect(title).toHaveValue('Rascunho no modal');

  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
});

test('/ fora de um campo de texto não abre a paleta por cima do modal de nova tarefa', async ({ page }) => {
  await page.goto('/');
  await openTaskCreateModal(page);
  const modal = page.getByRole('dialog', { name: 'O próximo passo.' });
  await expect(modal).toBeVisible();

  // Tira o foco dos campos de texto do modal antes de testar o atalho "/", que só age fora deles.
  await modal.getByRole('heading', { name: 'O próximo passo.' }).click();
  const title = modal.getByRole('textbox', { name: 'Título da tarefa' });
  await expect(title).not.toBeFocused();

  await page.keyboard.press('/');
  await expect(palette(page)).toHaveCount(0);
  await expect(modal).toBeVisible();
  await expect(title).toHaveValue('');
});

test('o foco fica preso no modal e Comandos não abre a paleta por cima', async ({ page }) => {
  await page.goto('/');
  await openTaskCreateModal(page);
  const modal = page.getByRole('dialog', { name: 'O próximo passo.' });
  await expect(modal).toBeVisible();

  await page.keyboard.press('Meta+K');
  await expect(palette(page)).toHaveCount(0);
  await expect(modal).toBeVisible();
});

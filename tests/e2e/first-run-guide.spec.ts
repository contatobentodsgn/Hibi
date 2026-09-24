import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test('mantém o foco no diálogo e Escape oferece retomada', async ({ page }) => {
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: 'Idioma e aparência' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fechar guia' })).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Continuar' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Fechar guia' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Retomar configuração' })).toBeFocused();
});

test('retoma o guia na etapa salva e conclui ao criar uma tarefa real', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('dialog', { name: 'Idioma e aparência' })).toBeVisible();

  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Mascote e notch' })).toBeVisible();
  await page.getByRole('button', { name: 'Agora não' }).click();
  await expect(page.getByRole('button', { name: 'Retomar configuração' })).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Retomar configuração' }).click();
  await expect(page.getByRole('heading', { name: 'Mascote e notch' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Pular etapa' }).click();
  await page.getByRole('button', { name: 'Pular etapa' }).click();

  await page.getByRole('button', { name: 'Criar minha primeira tarefa' }).click();
  await expect(page.getByRole('heading', { name: 'Tarefas, com espaço para respirar.' })).toBeVisible();
  await page.getByRole('button', { name: 'Criar tarefa' }).first().click();
  await page.getByLabel('Título da tarefa').fill('Minha primeira tarefa Pixano');
  await page.getByRole('button', { name: 'Criar tarefa' }).last().click();
  await expect(page.getByRole('button', { name: 'Retomar configuração' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Tarefas' }).click();
  await expect(page.getByText('Minha primeira tarefa Pixano')).toBeVisible();
});

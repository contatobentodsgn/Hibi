import { expect, test } from '@playwright/test';

// O formulário rápido da tela de Tarefas abre junto com a tela. Ele ficou ligado a um callback vazio,
// então aceitava o título e não criava nada — e a pessoa só descobria ao não ver a tarefa na lista.
test('o formulário rápido de Tarefas cria a tarefa, e ela sobrevive a recarregar', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Tarefas', exact: true }).click();

  const campo = page.getByRole('textbox', { name: 'New task title' });
  await campo.fill('Tarefa criada pelo formulário rápido');
  await page.getByRole('button', { name: 'Add task', exact: true }).click();

  await expect(page.getByText('Tarefa criada pelo formulário rápido')).toBeVisible();
  // O formulário se fecha e esvazia: deixar o título lá convida a criar a mesma tarefa duas vezes.
  await expect(page.getByRole('textbox', { name: 'New task title' })).toHaveCount(0);

  await page.reload();
  await page.getByRole('button', { name: 'Tarefas', exact: true }).click();
  await expect(page.getByText('Tarefa criada pelo formulário rápido')).toBeVisible();
});

// Criar com um filtro de pasta ligado e não ver a tarefa aparecer é indistinguível de não criar nada.
test('uma tarefa criada com a pasta filtrada nasce nessa pasta e aparece na lista', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Tarefas', exact: true }).click();
  await page.getByRole('button', { name: /^Pasta · Bento/ }).click();

  await page.getByRole('textbox', { name: 'New task title' }).fill('Tarefa da pasta filtrada');
  await page.getByRole('button', { name: 'Add task', exact: true }).click();

  await expect(page.getByText('Tarefa da pasta filtrada')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Pasta · Bento/, pressed: true })).toBeVisible();
});

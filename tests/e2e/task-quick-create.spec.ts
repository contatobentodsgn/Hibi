import { expect, test } from '@playwright/test';

const openTaskCreateDialog = async (page: import('@playwright/test').Page) => {
  await page.getByRole('button', { name: 'Nova tarefa', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
};

test('a criação rápida de Tarefas cria a tarefa, e ela sobrevive a recarregar', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Tarefas', exact: true }).click();

  await openTaskCreateDialog(page);
  const campo = page.getByRole('textbox', { name: 'Título da tarefa' });
  await campo.fill('Tarefa criada pelo formulário rápido');
  await page.getByRole('button', { name: 'Criar tarefa', exact: true }).click();

  await expect(page.getByText('Tarefa criada pelo formulário rápido')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.reload();
  await page.getByRole('button', { name: 'Tarefas', exact: true }).click();
  await expect(page.getByText('Tarefa criada pelo formulário rápido')).toBeVisible();
});

// Criar com um filtro de pasta ligado e não ver a tarefa aparecer é indistinguível de não criar nada.
test('uma tarefa criada com a pasta filtrada nasce nessa pasta e aparece na lista', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Tarefas', exact: true }).click();
  await page.getByLabel('Filtros de tarefas').getByRole('button', { name: /^Bento \d+$/ }).click();

  await openTaskCreateDialog(page);
  await page.getByRole('textbox', { name: 'Título da tarefa' }).fill('Tarefa da pasta filtrada');
  await page.getByRole('button', { name: 'Criar tarefa', exact: true }).click();

  await expect(page.getByText('Tarefa da pasta filtrada')).toBeVisible();
  await expect(page.getByLabel('Filtros de tarefas').getByRole('button', { name: /^Bento \d+$/ })).toBeVisible();
});

test('a tarefa rápida nasce na pasta filtrada, qualquer que seja, e em "Sem pasta" nasce sem pasta', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const data = JSON.parse(window.localStorage.getItem('hibi-study-data') ?? '{}');
    data.tasks.push({ id: 'e2e-cliente', title: 'Proposta', durationMinutes: 30, category: 'work', folder: 'Clientes' }, { id: 'e2e-solta', title: 'Solta', durationMinutes: 30, category: 'work' });
    window.localStorage.setItem('hibi-study-data', JSON.stringify(data));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Tarefas', exact: true }).click();

  await page.getByLabel('Filtros de tarefas').getByRole('button', { name: /^Clientes \d+$/ }).click();
  await openTaskCreateDialog(page);
  await page.getByRole('textbox', { name: 'Título da tarefa' }).fill('Contrato do cliente');
  await page.getByRole('button', { name: 'Criar tarefa', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Concluir Contrato do cliente' })).toBeVisible();

  await page.getByRole('button', { name: 'Hoje', exact: true }).click();
  await page.getByRole('button', { name: 'Tarefas', exact: true }).click();
  await page.getByLabel('Filtros de tarefas').getByRole('button', { name: /^Sem pasta \d+$/ }).click();
  await openTaskCreateDialog(page);
  await page.getByRole('textbox', { name: 'Título da tarefa' }).fill('Ideia sem pasta');
  await page.getByRole('button', { name: 'Criar tarefa', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Concluir Ideia sem pasta' })).toBeVisible();

  const pastas = await page.evaluate(() => {
    const data = JSON.parse(window.localStorage.getItem('hibi-study-data') ?? '{}') as { tasks: { title: string; folder?: string }[] };
    return Object.fromEntries(data.tasks.filter((task) => ['Contrato do cliente', 'Ideia sem pasta'].includes(task.title)).map((task) => [task.title, (task.folder ?? '').trim()]));
  });
  expect(pastas).toEqual({ 'Contrato do cliente': 'Clientes', 'Ideia sem pasta': '' });
});

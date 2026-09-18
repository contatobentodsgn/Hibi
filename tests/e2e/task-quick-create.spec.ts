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

// "Bento" era a pasta fixa de toda tarefa rápida, então o teste acima passava por coincidência. Com outra
// pasta filtrada, a tarefa ia para "Bento" e sumia da lista que a pessoa estava vendo.
test('a tarefa rápida nasce na pasta filtrada, qualquer que seja, e em "Sem pasta" nasce sem pasta', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const data = JSON.parse(window.localStorage.getItem('hibi-study-data') ?? '{}');
    data.tasks.push({ id: 'e2e-cliente', title: 'Proposta', durationMinutes: 30, category: 'work', folder: 'Clientes' }, { id: 'e2e-solta', title: 'Solta', durationMinutes: 30, category: 'work' });
    window.localStorage.setItem('hibi-study-data', JSON.stringify(data));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Tarefas', exact: true }).click();

  await page.getByRole('button', { name: /^Pasta · Clientes/ }).click();
  await page.getByRole('textbox', { name: 'New task title' }).fill('Contrato do cliente');
  await page.getByRole('button', { name: 'Add task', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Complete Contrato do cliente' })).toBeVisible();

  // O formulário rápido abre com a tela; "+ New task" abre o modal completo.
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Tarefas', exact: true }).click();
  await page.getByRole('button', { name: /^Pasta · Sem pasta/ }).click();
  await page.getByRole('textbox', { name: 'New task title' }).fill('Ideia sem pasta');
  await page.getByRole('button', { name: 'Add task', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Complete Ideia sem pasta' })).toBeVisible();

  const pastas = await page.evaluate(() => {
    const data = JSON.parse(window.localStorage.getItem('hibi-study-data') ?? '{}') as { tasks: { title: string; folder?: string }[] };
    return Object.fromEntries(data.tasks.filter((task) => ['Contrato do cliente', 'Ideia sem pasta'].includes(task.title)).map((task) => [task.title, (task.folder ?? '').trim()]));
  });
  expect(pastas).toEqual({ 'Contrato do cliente': 'Clientes', 'Ideia sem pasta': '' });
});

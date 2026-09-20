import { test, expect, type Page } from '@playwright/test';

const openMore = async (page: Page, name: string) => {
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
};
type Stored = { tasks: { id: string }[]; blocks: { title: string; start: string; end: string; taskId?: string }[]; reminders: unknown[] };
const stored = (page: Page) => page.evaluate(() => JSON.parse(window.localStorage.getItem('hibi-study-data') ?? '{}') as Stored);
const seedWith = async (page: Page, fn: string) => {
  await page.evaluate(fn);
  await page.reload();
};

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 8, 14, 10, 10, 0) });
  await page.goto('/');
});

// A sugestão "sem agenda" só se resolve com um bloco ligado à tarefa, e nenhuma tela criava esse vínculo.
test('"Reservar horário" liga um bloco à tarefa e a sugestão se resolve', async ({ page }) => {
  await seedWith(page, `(() => {
    const data = JSON.parse(window.localStorage.getItem('hibi-study-data') ?? '{}');
    data.blocks = [];
    data.tasks.push({ id: 'e2e-relatorio', title: 'Relatório trimestral', durationMinutes: 60, category: 'work', folder: 'Bento', deadline: '2026-09-16T18:00:00' });
    window.localStorage.setItem('hibi-study-data', JSON.stringify(data));
  })()`);
  await openMore(page, 'Revisão');
  const sugestao = page.locator('[data-review-suggestion="missing_schedule:e2e-relatorio"]');
  await expect(sugestao).toBeVisible();

  await sugestao.getByRole('button', { name: 'Reservar horário' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Reservado: Relatório trimestral, 14/09 10:30–11:30.' })).toBeVisible();
  await expect(sugestao).toHaveCount(0);
  const bloco = (await stored(page)).blocks.find((block) => block.taskId === 'e2e-relatorio');
  expect(bloco).toMatchObject({ title: 'Relatório trimestral', start: '2026-09-14T10:30:00', end: '2026-09-14T11:30:00' });
});

test('sem horário livre até o prazo, a sugestão explica em vez de criar um bloco', async ({ page }) => {
  await seedWith(page, `(() => {
    const data = JSON.parse(window.localStorage.getItem('hibi-study-data') ?? '{}');
    data.blocks = [{ id: 'e2e-cheio', title: 'Dia cheio', start: '2026-09-14T08:00:00', end: '2026-09-14T22:00:00', category: 'work' }];
    data.tasks.push({ id: 'e2e-urgente', title: 'Entrega urgente', durationMinutes: 60, category: 'work', folder: 'Bento', deadline: '2026-09-14T20:00:00' });
    window.localStorage.setItem('hibi-study-data', JSON.stringify(data));
  })()`);
  await openMore(page, 'Revisão');

  await page.locator('[data-review-suggestion="missing_schedule:e2e-urgente"]').getByRole('button', { name: 'Reservar horário' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Não há horário livre para Entrega urgente até o prazo.' })).toBeVisible();
  expect((await stored(page)).blocks.filter((block) => block.taskId === 'e2e-urgente')).toEqual([]);
});

test('uma sugestão dispensada continua dispensada depois de reabrir o app', async ({ page }) => {
  await seedWith(page, `(() => {
    const data = JSON.parse(window.localStorage.getItem('hibi-study-data') ?? '{}');
    data.tasks.push({ id: 'e2e-prazo', title: 'Pagar boleto', durationMinutes: 15, category: 'important', folder: 'Bento', deadline: '2026-09-15T10:00:00' });
    window.localStorage.setItem('hibi-study-data', JSON.stringify(data));
  })()`);
  await openMore(page, 'Revisão');
  const sugestao = page.locator('[data-review-suggestion="missing_schedule:e2e-prazo"]');
  await sugestao.getByRole('button', { name: 'Dismiss missing schedule' }).click();
  await expect(sugestao).toHaveCount(0);

  await page.reload();
  await openMore(page, 'Revisão');
  await expect(page.getByRole('region', { name: 'Review suggestions' })).toBeVisible();
  await expect(sugestao).toHaveCount(0);
});

test('uma meta concluída volta a andar quando o alvo aumenta', async ({ page }) => {
  await openMore(page, 'Metas');
  await page.getByLabel('New goal title').fill('Ler livros');
  await page.locator('#new-goal-target').fill('3');
  await page.getByRole('button', { name: 'Add goal' }).click();
  for (let i = 0; i < 3; i += 1) await page.getByRole('button', { name: 'Advance Ler livros' }).click();
  const linha = page.locator('.goal-row').filter({ hasText: 'Ler livros' });
  await expect(linha.getByText('Complete', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Edit Ler livros' }).click();
  await page.getByRole('form', { name: 'Edit Ler livros' }).getByLabel('Target').fill('5');
  await page.getByRole('form', { name: 'Edit Ler livros' }).getByRole('button', { name: 'Save' }).click();

  await expect(linha).toContainText('3 / 5');
  await expect(linha.getByText('Complete', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Advance Ler livros' })).toBeEnabled();
});

test('"Review spacing" abre a edição do lembrete que pode ser afastado', async ({ page }) => {
  await seedWith(page, `(() => {
    const data = JSON.parse(window.localStorage.getItem('hibi-study-data') ?? '{}');
    data.reminders = [
      { id: 'e2e-remedio', title: 'Remédio', category: 'important', status: 'open', schedule: { at: '2026-09-14T08:00:00', recurrence: { frequency: 'daily', time: '08:00' } } },
      { id: 'e2e-agua', title: 'Beber água', category: 'wellbeing', status: 'open', schedule: { at: '2026-09-14T08:30:00', recurrence: { frequency: 'daily', time: '08:30' } } },
    ];
    window.localStorage.setItem('hibi-study-data', JSON.stringify(data));
  })()`);
  await openMore(page, 'Lembretes');

  await page.getByRole('button', { name: 'Rever espaçamento' }).click();

  await expect(page.getByRole('dialog', { name: 'Editar lembrete' })).toBeVisible();
  await expect(page.getByLabel('Nome')).toHaveValue('Beber água');
});

test('um lembrete semanal sozinho, no mesmo horário em vários dias, não é "próximo de outro"', async ({ page }) => {
  await seedWith(page, `(() => {
    const data = JSON.parse(window.localStorage.getItem('hibi-study-data') ?? '{}');
    data.reminders = [{ id: 'e2e-aula', title: 'Aula', category: 'important', status: 'open', schedule: { at: '2026-09-14T19:00:00', recurrence: { frequency: 'weekly', weekdays: [1, 3], time: '19:00' } } }];
    window.localStorage.setItem('hibi-study-data', JSON.stringify(data));
  })()`);
  await openMore(page, 'Lembretes');
  await expect(page.getByRole('button', { name: 'Editar Aula' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rever espaçamento' })).toHaveCount(0);
});

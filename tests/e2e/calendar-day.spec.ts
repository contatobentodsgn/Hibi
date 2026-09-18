import { test, expect, type Page } from '@playwright/test';

const openMore = async (page: Page, name: string) => {
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
};
const stored = (page: Page) => page.evaluate(() => JSON.parse(window.localStorage.getItem('hibi-study-data') ?? '{}') as { habits: { title: string; completedDates: string[] }[]; reminders: { title: string; schedule: { at: string } }[] });

// Com a janela escondida na barra de menus nada renderizava de novo: depois da meia-noite a tela de
// Hábitos continuava no dia anterior, e o hábito marcado ia para ontem.
test('depois da meia-noite, sem recarregar, o hábito é marcado no dia novo', async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 8, 7, 23, 59, 0) });
  await page.goto('/');
  await openMore(page, 'Hábitos');
  await page.getByLabel('New habit title').fill('Ler');
  await page.getByRole('button', { name: 'Add habit' }).click();

  await page.clock.runFor(2 * 60_000);
  await page.getByRole('button', { name: 'Complete Ler today' }).click();

  await expect.poll(async () => (await stored(page)).habits.find((habit) => habit.title === 'Ler')?.completedDates).toEqual(['2026-09-08']);
});

const newReminder = async (page: Page) => {
  await openMore(page, 'Lembretes');
  await page.getByRole('button', { name: '+ New reminder' }).click();
  return page.getByRole('dialog', { name: 'Create reminder' });
};

// A data sugerida era a do bloco mais antigo guardado, que costuma estar no passado.
test('o lembrete novo sugere hoje quando o plano guardado já passou', async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 8, 7, 10, 0, 0) });
  await page.goto('/');
  await page.clock.setSystemTime(new Date(2026, 8, 20, 10, 0, 0));
  await page.reload();

  const form = await newReminder(page);
  await expect(form.getByLabel('Date')).toHaveValue('2026-09-20');
});

test('um lembrete único no passado é recusado, e o da lista mostra o dia', async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 8, 20, 10, 0, 0) });
  await page.goto('/');
  const form = await newReminder(page);
  await form.getByRole('textbox', { name: 'Title' }).fill('Ligar para o banco');
  await form.getByLabel('Date').fill('2026-09-20');
  await form.getByRole('textbox', { name: 'Time' }).fill('09:00');
  await form.getByRole('button', { name: 'Create reminder' }).click();

  await expect(form.getByRole('alert')).toHaveText('Esse horário já passou. Um lembrete único precisa de data e hora futuras.');
  expect((await stored(page)).reminders.map((reminder) => reminder.title)).not.toContain('Ligar para o banco');

  await form.getByRole('textbox', { name: 'Time' }).fill('11:00');
  await expect(form.getByRole('alert')).toHaveCount(0);
  await form.getByRole('button', { name: 'Create reminder' }).click();
  await expect(page.locator('.list-card').getByText('20/09 11:00 · one-time')).toBeVisible();
});

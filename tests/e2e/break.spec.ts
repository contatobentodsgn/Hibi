import { test, expect, type Page } from '@playwright/test';

const dock = (page: Page) => page.getByRole('navigation', { name: 'Navegação principal' });
const palette = (page: Page) => page.getByRole('dialog', { name: 'Paleta de comandos' });
// O App persiste a instrumentação em `hibi-events`; ler dali prova o que foi registrado de fato.
const recordedActions = (page: Page) => page.evaluate(() => (JSON.parse(window.localStorage.getItem('hibi-events') ?? '[]') as { action: string }[]).map((event) => event.action));
const countOf = (actions: string[], action: string) => actions.filter((item) => item === action).length;

async function openBreak(page: Page) {
  await expect(dock(page)).toBeVisible();
  await page.keyboard.press('Meta+K');
  await expect(palette(page)).toBeVisible();
  await palette(page).getByRole('combobox').fill('/break');
  await page.keyboard.press('Enter');
}

test('/break abre o Foco em modo pausa com 5 minutos, e a navegação marca Foco', async ({ page }) => {
  await page.goto('/');
  await openBreak(page);
  await expect(page.getByText('PAUSA · SESSÃO LOCAL')).toBeVisible();
  await expect(page.getByText('05:00')).toBeVisible();
  await expect(page.getByRole('button', { name: '5m', exact: true })).toHaveAttribute('aria-pressed', 'true');
  // A sessão de foco não mora em nenhum destino: a barra não marca nenhum, e o "Mais" mostra Foco como atual.
  await expect(dock(page).locator('[aria-current="page"]')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Onde você está' })).toContainText('Meu espaço / Foco');
  await dock(page).getByRole('button', { name: 'Mais seções' }).click();
  await expect(page.getByRole('menuitem', { name: 'Foco', exact: true })).toHaveAccessibleDescription('atual');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Voltar ao foco' }).click();
  await expect(page.getByText('25:00')).toBeVisible();
});

test('terminar uma pausa registra break-complete e nunca conta como foco', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await openBreak(page);
  await page.getByRole('button', { name: 'Começar pausa' }).click();
  await expect(page.getByRole('button', { name: 'Encerrar pausa' })).toBeVisible();

  await page.clock.runFor(5 * 60 * 1000 + 1000);

  await expect(page.getByRole('button', { name: 'Começar pausa' })).toBeVisible();
  // Contagem exata: o StrictMode dobra updaters impuros, então "contém" não bastaria para pegar duplicatas.
  await expect.poll(async () => countOf(await recordedActions(page), 'break-complete')).toBe(1);
  await expect(page.getByText('05:00')).toBeVisible();
  await page.clock.runFor(3000);
  // Quem pega uma duplicata tardia é avançar o relógio 3s e ler de novo; o poll só espera o React
  // renderizar e persistir no seu próprio agendamento antes de olhar o armazenamento.
  await expect.poll(async () => countOf(await recordedActions(page), 'break-complete')).toBe(1);
  const actions = await recordedActions(page);
  expect(actions).toContain('break-start');
  expect(actions).not.toContain('focus-start');
  expect(actions).not.toContain('focus-complete');
});

test('terminar uma sessão de foco registra exatamente um focus-complete', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await expect(dock(page)).toBeVisible();
  await dock(page).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Foco', exact: true }).click();
  await page.getByRole('button', { name: 'Start focus' }).click();

  await page.clock.runFor(25 * 60 * 1000 + 1000);

  await expect(page.getByRole('button', { name: 'Start focus' })).toBeVisible();
  await expect.poll(async () => countOf(await recordedActions(page), 'focus-complete')).toBe(1);
  await expect(page.getByText('25:00')).toBeVisible();
  await page.clock.runFor(3000);
  // Quem pega uma duplicata tardia é avançar o relógio 3s e ler de novo; o poll só espera o React
  // renderizar e persistir no seu próprio agendamento antes de olhar o armazenamento.
  await expect.poll(async () => countOf(await recordedActions(page), 'focus-complete')).toBe(1);
  const actions = await recordedActions(page);
  expect(actions).not.toContain('break-complete');
});

test('escolher Foco no menu durante a pausa não descarta a pausa', async ({ page }) => {
  await page.goto('/');
  await openBreak(page);
  await page.getByRole('button', { name: 'Começar pausa' }).click();
  await expect(page.getByRole('button', { name: 'Encerrar pausa' })).toBeVisible();

  await dock(page).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Foco', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Encerrar pausa' })).toBeVisible();
  await expect(page.getByText('PAUSA · SESSÃO LOCAL')).toBeVisible();
});

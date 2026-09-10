import { test, expect, type Page } from '@playwright/test';

const dock = (page: Page) => page.getByRole('navigation', { name: 'Navegação principal' });
const palette = (page: Page) => page.getByRole('dialog', { name: 'Paleta de comandos' });
// O App persiste a instrumentação em `hibi-events`; ler dali prova o que foi registrado de fato.
const recordedActions = (page: Page) => page.evaluate(() => (JSON.parse(window.localStorage.getItem('hibi-events') ?? '[]') as { action: string }[]).map((event) => event.action));

async function openBreak(page: Page) {
  await expect(dock(page)).toBeVisible();
  await page.keyboard.press('Meta+K');
  await expect(palette(page)).toBeVisible();
  await palette(page).getByRole('textbox').fill('/break');
  await page.keyboard.press('Enter');
}

test('/break abre o Foco em modo pausa com 5 minutos e o dock marca Foco', async ({ page }) => {
  await page.goto('/');
  await openBreak(page);
  await expect(page.getByText('PAUSA · SESSÃO LOCAL')).toBeVisible();
  await expect(page.getByText('05:00')).toBeVisible();
  await expect(page.getByRole('button', { name: '5m', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(dock(page).getByRole('button', { name: 'Foco', exact: true })).toHaveAttribute('aria-current', 'page');

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
  await expect.poll(() => recordedActions(page)).toContain('break-complete');
  const actions = await recordedActions(page);
  expect(actions).toContain('break-start');
  expect(actions).not.toContain('focus-start');
  expect(actions).not.toContain('focus-complete');
});

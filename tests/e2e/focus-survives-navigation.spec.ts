import { test, expect, type Page } from '@playwright/test';

const dock = (page: Page) => page.getByRole('navigation', { name: 'Navegação principal' });
const focusTypes = (page: Page) => page.evaluate(() => {
  const salvo = JSON.parse(window.localStorage.getItem('hibi-study-data') ?? '{}') as { activity?: { type: string }[] };
  return (salvo.activity ?? []).map((item) => item.type).filter((type) => type.startsWith('focus.'));
});

// Com o app na barra de menus a pessoa troca de tela o tempo todo. Antes, abrir Tarefas no meio de um
// foco desmontava a tela e a sessão virava "cancelada", sem como retomar.
test('trocar de tela não encerra a sessão de foco', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await dock(page).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Foco', exact: true }).click();
  await page.getByRole('button', { name: 'Start focus' }).click();
  await page.clock.runFor(60_000);

  await dock(page).getByRole('button', { name: 'Tarefas', exact: true }).click();
  const aviso = page.getByRole('status').filter({ hasText: 'Sessão de foco em andamento.' });
  await expect(aviso).toBeVisible();
  // A sessão continua andando enquanto outra tela está aberta.
  await page.clock.runFor(2 * 60_000);
  expect(await focusTypes(page)).toEqual(['focus.started']);

  await aviso.getByRole('button', { name: 'Voltar ao foco' }).click();
  await expect(page.getByRole('button', { name: 'Pause session' })).toBeVisible();
  await expect(page.getByText('22:00', { exact: true })).toBeVisible();
  await expect(aviso).toHaveCount(0);
});

test('a sessão que termina com outra tela aberta conta como concluída e o aviso some', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await dock(page).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Foco', exact: true }).click();
  await page.getByRole('button', { name: 'Start focus' }).click();
  await dock(page).getByRole('button', { name: 'Tarefas', exact: true }).click();
  await page.clock.runFor(25 * 60_000 + 1_000);

  await expect(page.getByText('Sessão de foco em andamento.')).toHaveCount(0);
  await expect.poll(() => focusTypes(page)).toEqual(['focus.started', 'focus.completed']);
});

test('a pausa de descanso continua encerrando a sessão pausada', async ({ page }) => {
  await page.goto('/');
  await dock(page).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Foco', exact: true }).click();
  await page.getByRole('button', { name: 'Start focus' }).click();
  await page.getByRole('button', { name: 'Pause session' }).click();
  await page.getByRole('button', { name: 'Fazer uma pausa' }).click();
  await expect(page.getByRole('button', { name: 'Começar pausa' })).toBeVisible();
  await expect.poll(() => focusTypes(page)).toEqual(['focus.started', 'focus.paused', 'focus.cancelled']);
  await expect(page.getByText('Sessão de foco em andamento.')).toHaveCount(0);
});

test('a sessão pausada também espera a volta, sem virar cancelada', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await dock(page).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Foco', exact: true }).click();
  await page.getByRole('button', { name: 'Start focus' }).click();
  await page.clock.runFor(60_000);
  await page.getByRole('button', { name: 'Pause session' }).click();

  await dock(page).getByRole('button', { name: 'Tarefas', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Sessão de foco em andamento.' })).toBeVisible();
  await dock(page).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Foco', exact: true }).click();

  await expect(page.getByText('24:00', { exact: true })).toBeVisible();
  await expect.poll(() => focusTypes(page)).toEqual(['focus.started', 'focus.paused']);
});

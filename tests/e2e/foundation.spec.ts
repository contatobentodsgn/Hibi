import { test, expect, type Page } from '@playwright/test';

const dock = (page: Page) => page.getByRole('navigation', { name: 'Navegação principal' });
const palette = (page: Page) => page.getByRole('dialog', { name: 'Paleta de comandos' });
const askTaby = async (page: Page, phrase: string) => {
  await page.goto('/');
  // A montagem inicial do React precisa terminar (e o listener de teclado com ela) antes que
  // Meta+K tenha efeito — sem essa espera, o atalho corre com a hidratação e a paleta não abre.
  await expect(dock(page)).toBeVisible();
  await page.keyboard.press('Meta+K');
  await expect(palette(page)).toBeVisible();
  await palette(page).getByRole('combobox').fill(phrase);
  await page.keyboard.press('Enter');
};
const openSettings = async (page: Page) => {
  await dock(page).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Ajustes', exact: true }).click();
};

test('⌘K com frase pede confirmação e Confirmar executa no lugar', async ({ page }) => {
  await askTaby(page, 'crie uma tarefa: Revisar briefing');
  const alert = palette(page).getByRole('alert');
  await expect(alert.getByRole('button', { name: 'Confirmar' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(palette(page).getByText('Tarefa criada: Revisar briefing')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(palette(page)).toHaveCount(0);
  await dock(page).getByRole('button', { name: 'Tarefas', exact: true }).click();
  await expect(page.getByText('Revisar briefing')).toBeVisible();
});

test('Cancelar no cartão da paleta não cria nada', async ({ page }) => {
  await askTaby(page, 'crie uma tarefa: Revisar briefing');
  await palette(page).getByRole('alert').getByRole('button', { name: 'Cancelar' }).click();
  await expect(palette(page).getByText('Ação cancelada.')).toBeVisible();
  await page.keyboard.press('Escape');
  await dock(page).getByRole('button', { name: 'Tarefas', exact: true }).click();
  await expect(page.getByText('Revisar briefing')).toHaveCount(0);
});

test('Esc em dois tempos: primeiro cancela a confirmação, depois fecha', async ({ page }) => {
  await askTaby(page, 'crie uma tarefa: Revisar briefing');
  await expect(palette(page).getByRole('alert')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(palette(page)).toBeVisible();
  await expect(palette(page).getByText('Ação cancelada.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(palette(page)).toHaveCount(0);
});

test('fechar a paleta com confirmação pendente cancela em vez de executar', async ({ page }) => {
  await askTaby(page, 'crie uma tarefa: Revisar briefing');
  await expect(palette(page).getByRole('alert')).toBeVisible();
  await page.mouse.click(10, 10);
  await expect(palette(page)).toHaveCount(0);
  await dock(page).getByRole('button', { name: 'Tarefas', exact: true }).click();
  await expect(page.getByText('Revisar briefing')).toHaveCount(0);
});

test('confirmação levantada na página Taby não é descartada ao abrir e fechar a paleta', async ({ page }) => {
  await page.goto('/');
  // Mesma cautela do askTaby: esperar o dock hidratar antes de qualquer atalho ou clique.
  await expect(dock(page)).toBeVisible();
  await dock(page).getByRole('button', { name: 'Taby', exact: true }).click();
  await page.getByRole('textbox', { name: 'Pergunte ou peça uma ação' }).fill('crie uma tarefa: Revisar briefing');
  await page.keyboard.press('Enter');
  const pageConfirmation = page.getByRole('alert');
  await expect(pageConfirmation.getByRole('button', { name: 'Confirmar' })).toBeVisible();

  await page.keyboard.press('Meta+K');
  await expect(palette(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(palette(page)).toHaveCount(0);
  // A confirmação nunca apareceu na paleta (ela não a levantou) e continua intacta na página.
  await expect(pageConfirmation.getByRole('button', { name: 'Confirmar' })).toBeVisible();

  await pageConfirmation.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText('Tarefa criada: Revisar briefing')).toBeVisible();
  await dock(page).getByRole('button', { name: 'Tarefas', exact: true }).click();
  await expect(page.getByText('Revisar briefing')).toBeVisible();
});

test('⌘K responde consultas sem sair da tela', async ({ page }) => {
  await askTaby(page, 'qual a agenda de hoje?');
  await expect(palette(page).getByText(/\d+ blocos na agenda/)).toBeVisible();
  await expect(page.getByText('Make room for')).toBeVisible();
});

test('tema manual sobrevive ao reload e o sistema volta a mandar em "Sistema"', async ({ page }) => {
  await page.goto('/');
  await openSettings(page);
  await page.getByRole('combobox', { name: 'Tema' }).selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await openSettings(page);
  await page.getByRole('combobox', { name: 'Tema' }).selectOption('system');
  const expectedSystemTheme = await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', expectedSystemTheme);
});

test('trocar o idioma troca o dock na hora e persiste', async ({ page }) => {
  await page.goto('/');
  await openSettings(page);
  await page.getByRole('combobox', { name: 'Language' }).selectOption('en');
  await expect(page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('button', { name: 'Tasks', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('a Agenda lembra a última visualização', async ({ page }) => {
  await page.goto('/');
  await dock(page).getByRole('button', { name: 'Agenda', exact: true }).click();
  await page.getByRole('tab', { name: 'Semana' }).click();
  await expect(page.getByText('Mon 07 — Sun 13')).toBeVisible();
  await dock(page).getByRole('button', { name: 'Home', exact: true }).click();
  await dock(page).getByRole('button', { name: 'Agenda', exact: true }).click();
  await expect(page.getByText('Mon 07 — Sun 13')).toBeVisible();
  await page.reload();
  await dock(page).getByRole('button', { name: 'Agenda', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Semana' })).toHaveAttribute('aria-selected', 'true');
});

test('o dock navega por teclado com setas', async ({ page }) => {
  await page.goto('/');
  await dock(page).getByRole('button', { name: 'Home', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(dock(page).getByRole('button', { name: 'Tarefas', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(dock(page).getByRole('button', { name: 'Comandos' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(palette(page)).toBeVisible();
});

test('a lista de comandos expõe opções, e aria-selected acompanha as setas', async ({ page }) => {
  await page.goto('/');
  await expect(dock(page)).toBeVisible();
  await page.keyboard.press('Meta+K');
  await expect(palette(page)).toBeVisible();
  const options = palette(page).getByRole('option');
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'false');
  await page.keyboard.press('ArrowDown');
  await expect(options.first()).toHaveAttribute('aria-selected', 'false');
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
});

test('/folder expõe as pastas na listbox "Pastas", e Tab não move o foco para uma opção', async ({ page }) => {
  await page.goto('/');
  await expect(dock(page)).toBeVisible();
  await page.keyboard.press('Meta+K');
  await expect(palette(page)).toBeVisible();
  const field = palette(page).getByRole('combobox');
  await field.fill('/folder');
  await page.keyboard.press('Enter');
  const listbox = palette(page).getByRole('listbox', { name: 'Pastas' });
  await expect(listbox).toBeVisible();
  await expect(listbox.getByRole('option').first()).toBeVisible();

  await field.focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('[role="option"]:focus')).toHaveCount(0);
});

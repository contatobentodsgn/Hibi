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
  await dock(page).getByRole('button', { name: 'Ajustes', exact: true }).click();
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
  // Mesma cautela do askTaby: esperar a barra hidratar antes de qualquer atalho ou clique.
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
  await expect(page.getByRole('heading', { name: 'Um dia de cada vez.' })).toBeVisible();
});

test('tema manual sobrevive ao reload e o sistema volta a mandar em "Sistema"', async ({ page }) => {
  await page.goto('/');
  await openSettings(page);
  // A Aparência da nova UI (U04): os temas são rádios com miniatura; clica-se no nome, como a pessoa faria.
  await page.getByRole('radiogroup', { name: 'Tema' }).getByText('Escuro', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await openSettings(page);
  await page.getByRole('radiogroup', { name: 'Tema' }).getByText('Sistema', { exact: true }).click();
  const expectedSystemTheme = await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', expectedSystemTheme);
});

test('trocar o idioma troca a barra na hora e persiste', async ({ page }) => {
  await page.goto('/');
  await openSettings(page);
  await page.getByRole('combobox', { name: 'Language' }).selectOption('en');
  await expect(page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('button', { name: 'Tasks', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

// O seed traz blocos fixos de 07 a 11/09/2026 e a Semana abre na data local real: sem fixar o
// relógio, o rótulo do período mudaria com a data real. Data montada com componentes locais.
const seedToday = () => new Date(2026, 8, 7, 10, 0, 0);

test('a Agenda lembra a última visualização', async ({ page }) => {
  await page.clock.install({ time: seedToday() });
  await page.goto('/');
  await dock(page).getByRole('button', { name: 'Agenda', exact: true }).click();
  await page.getByRole('tab', { name: 'Semana' }).click();
  await expect(page.getByText('07–13 de setembro')).toBeVisible();
  await dock(page).getByRole('button', { name: 'Hoje', exact: true }).click();
  await dock(page).getByRole('button', { name: 'Agenda', exact: true }).click();
  await expect(page.getByText('07–13 de setembro')).toBeVisible();
  await page.reload();
  await dock(page).getByRole('button', { name: 'Agenda', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Semana' })).toHaveAttribute('aria-selected', 'true');
});

test('a barra navega por teclado com setas', async ({ page }) => {
  await page.goto('/');
  await dock(page).getByRole('button', { name: 'Hoje', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(dock(page).getByRole('button', { name: 'Agenda', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(dock(page).getByRole('button', { name: 'Ajustes', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
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
  await expect(field).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(field).toBeFocused();
  await expect(page.locator('[role="option"]:focus')).toHaveCount(0);
});

test('mousedown numa opção não tira o foco do campo da paleta', async ({ page }) => {
  await page.goto('/');
  await expect(dock(page)).toBeVisible();
  await page.keyboard.press('Meta+K');
  await expect(palette(page)).toBeVisible();
  const field = palette(page).getByRole('combobox');
  await expect(field).toBeFocused();
  const firstOption = palette(page).getByRole('option').first();
  const optionBox = await firstOption.boundingBox();
  const paletteBox = await palette(page).boundingBox();
  if (!optionBox || !paletteBox) throw new Error('missing bounding box');
  await page.mouse.move(optionBox.x + optionBox.width / 2, optionBox.y + optionBox.height / 2);
  await page.mouse.down();
  // Solta em outro ponto dentro da paleta, mas fora de qualquer linha, para não disparar o clique
  // da opção (que navegaria e fecharia a paleta) — só o mousedown está sob teste aqui.
  await page.mouse.move(paletteBox.x + paletteBox.width / 2, paletteBox.y + 10);
  await page.mouse.up();
  await expect(field).toBeFocused();
});

test('/zzzz sem resultados fecha o combobox: aria-expanded e aria-controls somem', async ({ page }) => {
  await page.goto('/');
  await expect(dock(page)).toBeVisible();
  await page.keyboard.press('Meta+K');
  await expect(palette(page)).toBeVisible();
  const field = palette(page).getByRole('combobox');
  await field.fill('/zzzz');
  await expect(field).toHaveAttribute('aria-expanded', 'false');
  await expect(field).not.toHaveAttribute('aria-controls');
  await field.fill('');
  await expect(field).toHaveAttribute('aria-expanded', 'true');
  await expect(field).toHaveAttribute('aria-controls', 'palette-commands');
});

import { test, expect, type Page } from '@playwright/test';

const dock = (page: Page) => page.getByRole('navigation', { name: 'Navegação principal' });
const palette = (page: Page) => page.getByRole('dialog', { name: 'Paleta de comandos' });
// Nenhum console.error é aceitável na página de Estatísticas: capturamos desde o goto(). O aviso de
// CSP sobre `frame-ancestors` num <meta> é pré-existente em toda a app (index.html) e dispara em
// qualquer rota a cada carregamento — não é algo que a página de Estatísticas introduz.
const KNOWN_APP_WIDE_WARNING = "The Content Security Policy directive 'frame-ancestors' is ignored when delivered via a <meta> element.";
const captureConsoleErrors = (page: Page): string[] => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error' && message.text() !== KNOWN_APP_WIDE_WARNING) errors.push(message.text()); });
  return errors;
};

test('o menu "Mais seções" do dock abre Estatísticas', async ({ page }) => {
  const errors = captureConsoleErrors(page);
  await page.goto('/');
  await expect(dock(page)).toBeVisible();
  await dock(page).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Estatísticas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Estatísticas', level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a paleta de comandos com /stats abre a mesma página de Estatísticas', async ({ page }) => {
  const errors = captureConsoleErrors(page);
  await page.goto('/');
  await expect(dock(page)).toBeVisible();
  await page.keyboard.press('Meta+K');
  await expect(palette(page)).toBeVisible();
  await palette(page).getByRole('combobox').fill('/stats');
  await page.keyboard.press('Enter');
  await expect(palette(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Estatísticas', level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});

test('/review continua abrindo a Revisão, não Estatísticas', async ({ page }) => {
  await page.goto('/');
  await expect(dock(page)).toBeVisible();
  await page.keyboard.press('Meta+K');
  await expect(palette(page)).toBeVisible();
  await palette(page).getByRole('combobox').fill('/review');
  await page.keyboard.press('Enter');
  await expect(palette(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Review', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Estatísticas', level: 1 })).toHaveCount(0);
});

test('o dock reflete Estatísticas como seção atual, como faz para as demais seções de "Mais"', async ({ page }) => {
  await page.goto('/');
  await expect(dock(page)).toBeVisible();
  await dock(page).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Estatísticas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Estatísticas', level: 1 })).toBeVisible();
  // O gatilho "···" mostra data-active quando a seção atual não está entre os itens fixos do dock —
  // o mesmo comportamento já coberto para as demais seções de "Mais" (ex.: Ajustes, Revisão).
  await expect(dock(page).getByRole('button', { name: 'Mais seções' })).toHaveAttribute('data-active', 'true');
  await dock(page).getByRole('button', { name: 'Mais seções' }).click();
  await expect(page.getByRole('menuitem', { name: 'Estatísticas', exact: true })).toHaveAttribute('aria-current', 'page');
});

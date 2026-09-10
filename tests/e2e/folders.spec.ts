import { test, expect, type Page } from '@playwright/test';

const dock = (page: Page) => page.getByRole('navigation', { name: 'Navegação principal' });
const palette = (page: Page) => page.getByRole('dialog', { name: 'Paleta de comandos' });
const field = (page: Page) => palette(page).getByRole('textbox');
const row = (page: Page, name: string) => palette(page).locator(`.folder-row[data-folder="${name}"]`);

// A seed só tem a pasta "Bento". O app grava o workspace no primeiro render; acrescentamos uma pasta
// nova e itens sem pasta direto no armazenamento e recarregamos. Devolve a contagem de tarefas já
// existentes em "Bento" antes de acrescentar nada, para as asserções não dependerem do tamanho da seed.
async function openWithFolders(page: Page): Promise<number> {
  await page.goto('/');
  await expect(dock(page)).toBeVisible();
  const bento = await page.evaluate(() => {
    const data = JSON.parse(window.localStorage.getItem('hibi-study-data') ?? '{}');
    const stamp = '2026-09-10T12:00:00.000Z';
    const bento = (data.tasks ?? []).filter((task: { folder?: string }) => (task.folder ?? '').trim() === 'Bento').length;
    data.tasks.push({ id: 'e2e-client', title: 'Cliente A', durationMinutes: 30, category: 'work', folder: 'Clientes' }, { id: 'e2e-loose', title: 'Tarefa solta', durationMinutes: 30, category: 'work' });
    data.notes.push({ id: 'e2e-brief', title: 'Briefing do cliente', content: 'x', folder: 'Clientes', createdAt: stamp, updatedAt: stamp });
    window.localStorage.setItem('hibi-study-data', JSON.stringify(data));
    return bento;
  });
  await page.reload();
  await expect(dock(page)).toBeVisible();
  return bento;
}

async function openFolders(page: Page) {
  await page.keyboard.press('Meta+K');
  await expect(palette(page)).toBeVisible();
  await field(page).fill('/folder');
  await page.keyboard.press('Enter');
  await expect(field(page)).toHaveAttribute('placeholder', 'Filtrar pastas');
}

test('/folder lista as pastas com contagens e ↵ abre Tarefas filtrada', async ({ page }) => {
  const bento = await openWithFolders(page);
  await openFolders(page);
  await expect(row(page, 'Bento')).toContainText(`${bento} tarefas`);
  await expect(row(page, 'Clientes')).toContainText('1 tarefa · 1 nota');
  await expect(row(page, '')).toContainText('Sem pasta');

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(palette(page)).toHaveCount(0);
  await expect(page.getByText('Cliente A')).toBeVisible();
  await expect(page.getByText('Kabrito Post 01')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pasta · Clientes 1' })).toHaveAttribute('aria-pressed', 'true');
  await expect(dock(page).getByRole('button', { name: 'Tarefas', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('⇧↵ abre Notas filtrada pela pasta', async ({ page }) => {
  await openWithFolders(page);
  await openFolders(page);
  await field(page).fill('cli');
  await page.keyboard.press('Shift+Enter');
  await expect(page.getByText('Briefing do cliente')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pasta · Clientes 1' })).toHaveAttribute('aria-pressed', 'true');
});

test('renomear para um nome livre aplica na hora', async ({ page }) => {
  await openWithFolders(page);
  await openFolders(page);
  await field(page).fill('cli');
  await page.keyboard.press('Meta+Enter');
  await expect(palette(page).getByText('Renomear “Clientes”')).toBeVisible();
  await expect(field(page)).toHaveValue('Clientes');

  await field(page).fill('Estúdio');
  await page.keyboard.press('Enter');
  await expect(palette(page).getByRole('status')).toHaveText('Pasta renomeada.');
  await expect(row(page, 'Estúdio')).toContainText('1 tarefa · 1 nota');
  await expect(row(page, 'Clientes')).toHaveCount(0);
});

test('juntar pede um segundo ↵ com a contagem, e esc volta sem aplicar', async ({ page }) => {
  const bento = await openWithFolders(page);
  await openFolders(page);
  await field(page).fill('cli');
  await page.keyboard.press('Meta+Enter');
  await field(page).fill('Bento');
  await page.keyboard.press('Enter');
  const merge = palette(page).getByRole('alert');
  await expect(merge).toHaveText('Juntar “Clientes” em “Bento”: 1 tarefa · 1 nota');

  // esc volta à renomeação com o nome digitado; esc de novo volta à lista, sem nada aplicado.
  await page.keyboard.press('Escape');
  await expect(field(page)).toHaveValue('Bento');
  await page.keyboard.press('Escape');
  await expect(row(page, 'Clientes')).toContainText('1 tarefa · 1 nota');

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Meta+Enter');
  await field(page).fill('Bento');
  await page.keyboard.press('Enter');
  await expect(merge).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(row(page, 'Bento')).toContainText(`${bento + 1} tarefas · 1 nota`);
  await expect(row(page, 'Clientes')).toHaveCount(0);
});

test('"Sem pasta" abre, mas não oferece renomeação; esc volta aos comandos', async ({ page }) => {
  await openWithFolders(page);
  await openFolders(page);
  await field(page).fill('sem');
  await page.keyboard.press('Meta+Enter');
  await expect(row(page, '')).toBeVisible();
  await expect(palette(page).getByText(/^Renomear/)).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(field(page)).toHaveAttribute('placeholder', 'Digite um comando ou pergunte ao Taby');
  await expect(palette(page).locator('#command-day')).toBeVisible();

  await field(page).fill('/folder');
  await page.keyboard.press('Enter');
  await field(page).fill('sem');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Tarefa solta')).toBeVisible();
});

test('recusa mostra o motivo e some ao digitar', async ({ page }) => {
  await openWithFolders(page);
  await openFolders(page);
  await field(page).fill('cli');
  await page.keyboard.press('Meta+Enter');
  await field(page).fill('');
  await page.keyboard.press('Enter');
  await expect(palette(page).getByRole('alert')).toHaveText('O nome não pode ficar vazio.');

  await field(page).fill('X');
  await expect(palette(page).getByRole('alert')).toHaveText('');
});

test('digitar /folder com uma confirmação pendente cancela a confirmação', async ({ page }) => {
  await page.goto('/');
  await expect(dock(page)).toBeVisible();
  await page.keyboard.press('Meta+K');
  await expect(palette(page)).toBeVisible();
  await field(page).fill('crie uma tarefa: Revisar briefing');
  await page.keyboard.press('Enter');
  const alert = palette(page).getByRole('alert');
  await expect(alert.getByRole('button', { name: 'Confirmar' })).toBeVisible();

  await field(page).fill('/folder');
  await expect(alert.getByRole('button', { name: 'Confirmar' })).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(field(page)).toHaveAttribute('placeholder', 'Filtrar pastas');

  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(palette(page)).toHaveCount(0);

  await dock(page).getByRole('button', { name: 'Tarefas', exact: true }).click();
  await expect(page.getByText('Revisar briefing')).toHaveCount(0);
});

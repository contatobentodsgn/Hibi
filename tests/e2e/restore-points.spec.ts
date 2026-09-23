import { test, expect, type Page } from '@playwright/test';

const dock = (page: Page) => page.getByRole('navigation', { name: 'Navegação principal' });
const openDataTab = async (page: Page) => {
  await dock(page).getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('button', { name: /^Dados/ }).click();
};

type Point = { id: number; label: string; createdAt: string; bytes: number };

/** O banco é do processo principal; aqui o dublê guarda os pontos e decide se restaurar falha. */
async function installBridge(page: Page, points: Point[], { restoreFails = false } = {}) {
  await page.addInitScript((input) => {
    const payload = JSON.stringify({ version: 2, data: {}, preferences: {} });
    (window as unknown as { hibiDesktop: unknown }).hibiDesktop = {
      readWorkspace: async () => ({ payload: null }),
      saveWorkspace: async () => ({ ok: true }),
      listWorkspaceRestorePoints: async () => input.points,
      restoreWorkspace: async () => { if (input.restoreFails) throw new Error('O banco recusou a restauração.'); return { payload }; },
    };
  }, { points, restoreFails });
}

const pontos: Point[] = [
  { id: 3, label: 'data.restorePoint.beforeReset', createdAt: '2026-09-16T12:00:00.000Z', bytes: 2048 },
  { id: 2, label: 'before-restore', createdAt: '2026-09-15T12:00:00.000Z', bytes: 1048576 },
  { id: 1, label: 'rótulo que ninguém reconhece', createdAt: '2026-09-14T12:00:00.000Z', bytes: 512 },
];

test('a lista mostra cada ponto com rótulo legível, data e tamanho', async ({ page }) => {
  await installBridge(page, pontos);
  await page.goto('/');
  await openDataTab(page);

  const lista = page.getByRole('list', { name: 'Workspace restore points' });
  await expect(lista.getByText('Antes de apagar todos os dados')).toBeVisible();
  // O ponto antigo guarda o rótulo de antes, não a chave: ele precisa continuar legível.
  await expect(lista.getByText('Antes de reverter alterações')).toBeVisible();
  await expect(lista.getByText('before-restore')).toHaveCount(0);
  // E um rótulo que ninguém reconhece aparece como veio, em vez de sumir da linha.
  await expect(lista.getByText('rótulo que ninguém reconhece')).toBeVisible();
  await expect(lista.getByText('2 KB', { exact: false })).toBeVisible();
  await expect(lista.getByText('1.0 MB', { exact: false })).toBeVisible();
});

test('sem nenhum ponto, o app de desktop diz que ainda não há, e não manda abrir a si mesmo', async ({ page }) => {
  await installBridge(page, []);
  await page.goto('/');
  await openDataTab(page);

  await expect(page.getByText('Nenhum ponto de restauração ainda.', { exact: false })).toBeVisible();
  await expect(page.getByText('ficam no app de desktop do Pixano', { exact: false })).toHaveCount(0);
});

test('fora do app de desktop, a tela diz onde os pontos existem', async ({ page }) => {
  await page.goto('/');
  await openDataTab(page);

  await expect(page.getByText('ficam no app de desktop do Pixano', { exact: false })).toBeVisible();
});

test('uma restauração que falha avisa sem apagar da tela os pontos que continuam existindo', async ({ page }) => {
  await installBridge(page, pontos, { restoreFails: true });
  page.on('dialog', (dialog) => void dialog.accept());
  await page.goto('/');
  await openDataTab(page);

  await page.getByRole('button', { name: 'Restore', exact: true }).first().click();

  await expect(page.getByText('O banco recusou a restauração.')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Workspace restore points' })).toBeVisible();
});

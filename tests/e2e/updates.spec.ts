import { test, expect, type Page } from '@playwright/test';

const dock = (page: Page) => page.getByRole('navigation', { name: 'Navegação principal' });
const openUpdates = async (page: Page) => {
  await dock(page).getByRole('button', { name: 'Comandos' }).click();
  const palette = page.getByRole('dialog', { name: 'Paleta de comandos' });
  await palette.getByRole('combobox').fill('/updates');
  await page.keyboard.press('Enter');
};

/** O serviço vive no processo principal; aqui o dublê guarda os pedidos e empurra os estados. */
async function installBridge(page: Page, initial: string) {
  await page.addInitScript((status) => {
    let state = { status, version: status === 'available' ? '0.2.0' : null, error: null as string | null, percent: undefined as number | undefined };
    const listeners: ((value: unknown) => void)[] = [];
    const recorded: string[] = [];
    const publish = (patch: Record<string, unknown>) => { state = { ...state, ...patch }; for (const listener of listeners) listener(state); return state; };
    (window as unknown as { hibiE2E: unknown }).hibiE2E = { recorded, publish };
    (window as unknown as { hibiDesktop: unknown }).hibiDesktop = {
      getUpdateState: async () => state,
      checkForUpdate: async () => { recorded.push('check'); return publish({ status: 'current' }); },
      downloadUpdate: async () => { recorded.push('download'); return publish({ status: 'downloaded', percent: 100 }); },
      installUpdate: async () => { recorded.push('install'); return state; },
      onUpdateState: (callback: (value: unknown) => void) => { listeners.push(callback); return () => listeners.splice(listeners.indexOf(callback), 1); },
    };
  }, initial);
}

test('sem origem configurada, a tela explica em vez de oferecer um botão morto', async ({ page }) => {
  await installBridge(page, 'disabled');
  await page.goto('/');
  await openUpdates(page);

  await expect(page.getByText('Nenhuma origem de atualização configurada')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Procurar atualizações' })).toHaveCount(0);
});

test('procurar, baixar e instalar são três pedidos, um de cada vez', async ({ page }) => {
  await installBridge(page, 'idle');
  await page.goto('/');
  await openUpdates(page);

  await page.getByRole('button', { name: 'Procurar atualizações' }).click();
  await expect(page.getByText('Você está na versão mais recente')).toBeVisible();

  await page.evaluate(() => (window as unknown as { hibiE2E: { publish: (patch: Record<string, unknown>) => void } }).hibiE2E.publish({ status: 'available', version: '0.2.0' }));
  await page.getByRole('button', { name: 'Baixar', exact: true }).click();
  await expect(page.getByText('Reinicie para aplicar')).toBeVisible();

  await page.getByRole('button', { name: 'Reiniciar e instalar' }).click();
  expect(await page.evaluate(() => (window as unknown as { hibiE2E: { recorded: string[] } }).hibiE2E.recorded)).toEqual(['check', 'download', 'install']);
});

test('uma falha aparece na tela com o motivo, e não some em silêncio', async ({ page }) => {
  await installBridge(page, 'idle');
  await page.goto('/');
  await openUpdates(page);

  await page.evaluate(() => (window as unknown as { hibiE2E: { publish: (patch: Record<string, unknown>) => void } }).hibiE2E.publish({ status: 'error', error: 'Could not get code signature for running application' }));

  await expect(page.getByText('A atualização não pôde continuar')).toBeVisible();
  await expect(page.getByText('Could not get code signature for running application')).toBeVisible();
});

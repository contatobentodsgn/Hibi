import { test, expect, type Page } from '@playwright/test';

const dock = (page: Page) => page.getByRole('navigation', { name: 'Navegação principal' });
const openSettings = async (page: Page) => {
  await dock(page).getByRole('button', { name: 'Ajustes', exact: true }).click();
};
const tab = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

/** O modelo é pedido e baixado pela tela: o dublê guarda o pedido e controla o progresso. */
async function installBridge(page: Page, status: 'missing' | 'ready') {
  await page.addInitScript((initial) => {
    let state = { status: initial, modelId: initial === 'ready' ? 'qwen3-1.7b-q8_0' : null, sizeBytes: initial === 'ready' ? 1834426016 : 0, error: null };
    const listeners: ((progress: unknown) => void)[] = [];
    const recorded = { downloads: 0, cancels: 0 };
    (window as unknown as { hibiE2E: unknown }).hibiE2E = {
      recorded,
      progress(received: number, total: number) { for (const listener of listeners) listener({ status: 'downloading', receivedBytes: received, totalBytes: total, error: null }); },
      finish() { state = { status: 'ready', modelId: 'qwen3-1.7b-q8_0', sizeBytes: 1834426016, error: null }; for (const listener of listeners) listener({ status: 'ready', receivedBytes: 1834426016, totalBytes: 1834426016, error: null }); },
    };
    (window as unknown as { hibiDesktop: unknown }).hibiDesktop = {
      getLocalModelState: async () => state,
      verifyLocalModel: async () => ({ verified: true, modelId: state.modelId, error: null }),
      downloadLocalModel: async () => { recorded.downloads += 1; return { status: 'downloading', receivedBytes: 0, totalBytes: 1834426016, error: null }; },
      cancelLocalModelDownload: async () => { recorded.cancels += 1; return true; },
      onLocalModelDownloadProgress: (callback: (progress: unknown) => void) => { listeners.push(callback); return () => listeners.splice(listeners.indexOf(callback), 1); },
    };
  }, status);
}

test('quem ainda não tem o cérebro offline encontra e baixa o modelo na aba de IA', async ({ page }) => {
  await installBridge(page, 'missing');
  await page.goto('/');
  await openSettings(page);
  await tab(page, 'AI').click();

  const panel = page.getByText('Cérebro offline').locator('..');
  await expect(panel).toContainText('Ainda não baixado');
  await expect(panel).toContainText('responde com frases prontas');

  await page.getByRole('button', { name: 'Baixar', exact: true }).click();
  await page.evaluate(() => (window as unknown as { hibiE2E: { progress: (a: number, b: number) => void } }).hibiE2E.progress(917213008, 1834426016));

  const progress = page.getByRole('progressbar');
  await expect(progress).toHaveAttribute('aria-valuenow', '50');
  await expect(page.getByRole('button', { name: 'Cancelar', exact: true })).toBeVisible();

  await page.evaluate(() => (window as unknown as { hibiE2E: { finish: () => void } }).hibiE2E.finish());
  await expect(panel).toContainText('Pronto neste Mac');
  await expect(panel).toContainText('O Taby responde suas perguntas com este modelo');
  expect(await page.evaluate(() => (window as unknown as { hibiE2E: { recorded: { downloads: number } } }).hibiE2E.recorded.downloads)).toBe(1);
});

test('o cérebro offline fica com as outras opções de IA, e não na aba de dados', async ({ page }) => {
  await installBridge(page, 'ready');
  await page.goto('/');
  await openSettings(page);

  await tab(page, 'Data').click();
  await expect(page.getByText('Cérebro offline')).toHaveCount(0);

  await tab(page, 'AI').click();
  await expect(page.getByText('Cérebro offline')).toBeVisible();
});

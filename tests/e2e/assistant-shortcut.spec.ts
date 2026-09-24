import { test, expect, type Page } from '@playwright/test';

const dock = (page: Page) => page.getByRole('navigation', { name: 'Navegação principal' });
const openSettings = async (page: Page) => {
  await dock(page).getByRole('button', { name: 'Ajustes', exact: true }).click();
};

/** O atalho é registrado no processo principal; aqui o dublê guarda a escolha e dispara o toque. */
async function installBridge(page: Page, status: 'active' | 'taken' = 'active') {
  await page.addInitScript((initial) => {
    let state = { accelerator: 'Command+Shift+Space', status: initial };
    const listeners: (() => void)[] = [];
    const recorded: (string | null)[] = [];
    (window as unknown as { pixanoE2E: unknown }).pixanoE2E = {
      recorded,
      press() { for (const listener of listeners) listener(); },
    };
    (window as unknown as { pixanoDesktop: unknown }).pixanoDesktop = {
      getAssistantShortcut: async () => state,
      setAssistantShortcut: async (accelerator: string | null) => { recorded.push(accelerator); state = { accelerator, status: accelerator ? 'active' : 'disabled' }; return state; },
      onAssistantShortcut: (callback: () => void) => { listeners.push(callback); return () => listeners.splice(listeners.indexOf(callback), 1); },
    };
  }, status);
}

test('o atalho global abre o Assistant de qualquer tela', async ({ page }) => {
  await installBridge(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Tarefas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tarefas, com espaço para respirar.' })).toBeVisible();

  await page.evaluate(() => (window as unknown as { pixanoE2E: { press: () => void } }).pixanoE2E.press());

  await expect(page.getByPlaceholder('Pergunte ou peça uma ação')).toBeVisible();
});

test('a pessoa escolhe a combinação em Ajustes, e o pedido chega ao sistema', async ({ page }) => {
  await installBridge(page);
  await page.goto('/');
  await openSettings(page);

  const select = page.getByLabel('Atalho do assistente');
  await expect(select).toHaveValue('Command+Shift+Space');
  await expect(page.getByText('Valendo neste Mac')).toBeVisible();

  await select.selectOption('Option+Space');
  await expect(page.getByText('Valendo neste Mac')).toBeVisible();

  await select.selectOption('off');
  await expect(page.getByText('Desligado').first()).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { pixanoE2E: { recorded: (string | null)[] } }).pixanoE2E.recorded)).toEqual(['Option+Space', null]);
});

test('quando outro app já tem a tecla, a tela pede outra combinação em vez de ficar calada', async ({ page }) => {
  await installBridge(page, 'taken');
  await page.goto('/');
  await openSettings(page);

  await expect(page.getByText('Outro app já usa essa combinação. Escolha outra.')).toBeVisible();
});

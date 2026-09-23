import { expect, test, type Page } from '@playwright/test';

// A Aparência da nova UI (U04): tema, tom, contraste, movimento e a posição da barra de navegação.
const nav = (page: Page) => page.getByRole('navigation', { name: 'Navegação principal' });
const group = (page: Page, name: string) => page.getByRole('radiogroup', { name });
// O rádio do React Aria fica escondido dentro do rótulo; clica-se no texto, como a pessoa faria.
const choose = (page: Page, groupName: string, option: string) => group(page, groupName).getByText(option, { exact: true }).click();
const openSettings = async (page: Page) => { await nav(page).getByRole('button', { name: 'Ajustes', exact: true }).click(); };
const notchBottom = async (page: Page) => { const box = (await page.locator('.notch-center').boundingBox())!; return box.y + box.height; };
const ZINC_950 = 'oklch(0.141 0.005 285.823)';
const ZINC_200 = 'oklch(0.92 0.004 286.32)';

test('a posição vale na hora, sem remontar o conteúdo, e continua depois de reabrir', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?overlay=ui-navigation');
  expect(await notchBottom(page)).toBe(8 + 44);
  const draft = page.getByRole('textbox', { name: 'Rascunho' });
  await draft.fill('Meu rascunho, pela metade');
  await draft.evaluate((element) => { (element as HTMLTextAreaElement & { hibiMarker?: string }).hibiMarker = 'o mesmo elemento'; });

  await choose(page, 'Menu de navegação', 'Inferior');
  await expect(group(page, 'Menu de navegação').getByRole('radio', { name: 'Inferior' })).toBeChecked();
  expect(await notchBottom(page)).toBe(900 - 8);
  // O rascunho continua lá, no mesmo elemento: a troca não remontou a área de conteúdo.
  await expect(draft).toHaveValue('Meu rascunho, pela metade');
  expect(await draft.evaluate((element) => (element as HTMLTextAreaElement & { hibiMarker?: string }).hibiMarker)).toBe('o mesmo elemento');
  expect(await page.evaluate(() => localStorage.getItem('hibi.ui.navigation-position.v1'))).toBe('bottom');

  // Trocar o tema também não remonta.
  await choose(page, 'Tema', 'Escuro');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await draft.evaluate((element) => (element as HTMLTextAreaElement & { hibiMarker?: string }).hibiMarker)).toBe('o mesmo elemento');

  await page.reload();
  expect(await notchBottom(page)).toBe(900 - 8);
  await expect(group(page, 'Menu de navegação').getByRole('radio', { name: 'Inferior' })).toBeChecked();
});

test('um valor guardado que não é uma escolha vale como a automática, que sem o mascote fica em cima', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('hibi.ui.navigation-position.v1', 'sideways'));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  expect(await notchBottom(page)).toBe(8 + 44);
  await openSettings(page);
  await expect(group(page, 'Menu de navegação').getByRole('radio', { name: 'Automática' })).toBeChecked();
  await expect(page.getByRole('status').filter({ hasText: 'Agora em cima: o mascote não está nesta tela.' })).toBeVisible();
});

// U04b: a ponte do desktop diz se o mascote do notch está na mesma tela que a janela; o teste simula a janela
// indo e voltando entre monitores.
const installMascotPlacement = (page: Page, sharesDisplay: boolean) => page.addInitScript((initial) => {
  let current = initial;
  let listener: ((state: { sharesDisplay: boolean }) => void) | null = null;
  (window as unknown as { hibiE2E: unknown }).hibiE2E = { move(shares: boolean) { current = shares; listener?.({ sharesDisplay: shares }); } };
  (window as unknown as { hibiDesktop: Record<string, unknown> }).hibiDesktop = {
    info: async () => ({ name: 'Pixano', version: '0.1.0', localOnly: true }),
    getNotchWindowPlacement: async () => ({ sharesDisplay: current }),
    onNotchWindowPlacementChanged: (callback: (state: { sharesDisplay: boolean }) => void) => { listener = callback; return () => { listener = null; }; },
  };
}, sharesDisplay);
const moveWindow = (page: Page, sharesDisplay: boolean) => page.evaluate((shares) => (window as unknown as { hibiE2E: { move: (shares: boolean) => void } }).hibiE2E.move(shares), sharesDisplay);

test('na automática, a barra desce com o mascote na tela da janela e sobe quando a janela vai para outra tela', async ({ page }) => {
  await installMascotPlacement(page, true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect.poll(() => notchBottom(page)).toBe(900 - 8);
  await openSettings(page);
  await expect(group(page, 'Menu de navegação').getByRole('radio', { name: 'Automática' })).toBeChecked();
  await expect(page.getByRole('status').filter({ hasText: 'Agora embaixo: o mascote está nesta tela.' })).toBeVisible();

  await moveWindow(page, false);
  await expect.poll(() => notchBottom(page)).toBe(8 + 44);
  await expect(page.getByRole('status').filter({ hasText: 'Agora em cima: o mascote não está nesta tela.' })).toBeVisible();
  await moveWindow(page, true);
  await expect.poll(() => notchBottom(page)).toBe(900 - 8);
});

test('Superior e Inferior valem mesmo com o mascote, e voltar à automática devolve a regra', async ({ page }) => {
  await installMascotPlacement(page, true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await openSettings(page);
  await choose(page, 'Menu de navegação', 'Superior');
  await expect.poll(() => notchBottom(page)).toBe(8 + 44);
  await moveWindow(page, false);
  await moveWindow(page, true);
  expect(await notchBottom(page)).toBe(8 + 44);

  await moveWindow(page, false);
  await choose(page, 'Menu de navegação', 'Inferior');
  await expect.poll(() => notchBottom(page)).toBe(900 - 8);

  await choose(page, 'Menu de navegação', 'Automática');
  await expect.poll(() => notchBottom(page)).toBe(8 + 44);
  expect(await page.evaluate(() => localStorage.getItem('hibi.ui.navigation-position.v1'))).toBe('auto');
});

test('com o armazenamento recusado, a posição vale na sessão e o aviso diz que não foi guardada', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key: string, value: string) {
      if (key === 'hibi.ui.navigation-position.v1') throw new DOMException('cota', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await openSettings(page);
  await expect(page.getByRole('status').filter({ hasText: 'Não deu para guardar' })).toHaveCount(0);
  await choose(page, 'Menu de navegação', 'Inferior');
  expect(await notchBottom(page)).toBe(900 - 8);
  await expect(page.getByRole('status').filter({ hasText: 'Não deu para guardar a posição: ela vale até você fechar o Pixano.' })).toBeVisible();
});

test('as quatro combinações de tema e posição funcionam', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await openSettings(page);
  for (const [theme, label, frame] of [['light', 'Claro', ZINC_950], ['dark', 'Escuro', ZINC_200]] as const) {
    await choose(page, 'Tema', label);
    for (const [position, option, bottom] of [['top', 'Superior', 8 + 44], ['bottom', 'Inferior', 900 - 8]] as const) {
      await choose(page, 'Menu de navegação', option);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('.notch-frame')).toHaveAttribute('data-position', position);
      await expect(page.locator('.notch-center')).toHaveCSS('background-color', frame);
      expect(await notchBottom(page), `${theme} ${position}`).toBe(bottom);
    }
  }
});

test('"Sistema" acompanha o macOS; um tema escolhido, não', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await openSettings(page);
  await choose(page, 'Tema', 'Sistema');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await choose(page, 'Tema', 'Claro');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('a sessão de foco continua depois de trocar tema, tom e posição', async ({ page }) => {
  await page.goto('/');
  await nav(page).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Foco', exact: true }).click();
  await page.getByRole('button', { name: 'Start focus' }).click();
  await expect(page.getByRole('button', { name: 'Pause session' })).toBeVisible();

  await openSettings(page);
  await choose(page, 'Tema', 'Escuro');
  await group(page, 'Um toque de cor').getByRole('radio', { name: 'Menta' }).check({ force: true });
  await expect(page.locator('html')).toHaveAttribute('data-tint', 'mint');
  await choose(page, 'Menu de navegação', 'Inferior');

  await nav(page).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Foco', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause session' })).toBeVisible();
});

test('a Aparência não mexe no monitor do mascote do notch', async ({ page }) => {
  await page.addInitScript(() => {
    const display = { id: 7, label: 'Monitor do mascote', primary: false, internal: true, hasCameraHousing: true, width: 1512, height: 982 };
    const calls: (number | null)[] = [];
    (window as unknown as { hibiE2E: { calls: (number | null)[] } }).hibiE2E = { calls };
    (window as unknown as { hibiDesktop: Record<string, unknown> }).hibiDesktop = {
      info: async () => ({ name: 'Pixano', version: '0.1.0', localOnly: true }),
      listNotchDisplays: async () => ({ preference: { displayId: 7, displayLabel: display.label }, resolvedDisplayId: 7, reason: 'preferred', displays: [display] }),
      setNotchDisplay: async (displayId: number | null) => { calls.push(displayId); return { preference: { displayId, displayLabel: display.label }, resolvedDisplayId: 7, reason: 'preferred', displays: [display] }; },
      onNotchDisplaysChanged: () => () => undefined,
    };
  });
  await page.goto('/');
  await openSettings(page);
  await choose(page, 'Tema', 'Escuro');
  await group(page, 'Um toque de cor').getByRole('radio', { name: 'Azul' }).check({ force: true });
  await choose(page, 'Menu de navegação', 'Inferior');
  await page.getByRole('switch', { name: 'Mais contraste' }).check({ force: true });
  await page.getByRole('switch', { name: 'Reduzir movimento' }).check({ force: true });
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
  expect(await page.evaluate(() => (window as unknown as { hibiE2E: { calls: (number | null)[] } }).hibiE2E.calls)).toEqual([]);
});

// Revisão da U04b: a resposta da ponte chega depois do primeiro desenho.
test('na automática, o Hibi abre com a barra onde ela ficou da última vez, sem descer depois', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('hibi.ui.mascot-shares-display.v1', 'true');
    (window as unknown as { hibiDesktop: Record<string, unknown> }).hibiDesktop = {
      info: async () => ({ name: 'Pixano', version: '0.1.0', localOnly: true }),
      getNotchWindowPlacement: () => new Promise((resolve) => { setTimeout(() => resolve({ sharesDisplay: true }), 300); }),
      onNotchWindowPlacementChanged: () => () => undefined,
    };
    // Cada posição que a barra teve, quadro a quadro, desde o primeiro.
    const seen: string[] = [];
    (window as unknown as { hibiE2E: { seen: string[] } }).hibiE2E = { seen };
    const watch = () => {
      const position = document.querySelector('.notch-frame')?.getAttribute('data-position');
      if (position && seen.at(-1) !== position) seen.push(position);
      if (performance.now() < 4000) requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect.poll(() => notchBottom(page)).toBe(900 - 8);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as unknown as { hibiE2E: { seen: string[] } }).hibiE2E.seen)).toEqual(['bottom']);
});

test('a resposta nova sobre o mascote fica guardada para a próxima abertura', async ({ page }) => {
  await installMascotPlacement(page, true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('hibi.ui.mascot-shares-display.v1'))).toBe('true');
  await moveWindow(page, false);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('hibi.ui.mascot-shares-display.v1'))).toBe('false');
});

test('quando a barra troca de borda, a pílula do destino atual vai junto, e entre destinos ela ainda desliza', async ({ page }) => {
  await installMascotPlacement(page, false);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect.poll(() => notchBottom(page)).toBe(8 + 44);
  // A maior distância entre a pílula e o botão dela, quadro a quadro, depois de a barra descer.
  const drift = await page.evaluate(() => new Promise<number>((resolve) => {
    (window as unknown as { hibiE2E: { move: (shares: boolean) => void } }).hibiE2E.move(true);
    let worst = 0;
    const start = performance.now();
    const tick = () => {
      const button = document.querySelector('.notch-center [aria-current]');
      const pill = button?.querySelector(':scope > span:first-child');
      if (button && pill) worst = Math.max(worst, Math.abs(pill.getBoundingClientRect().top - button.getBoundingClientRect().top));
      if (performance.now() - start < 600) requestAnimationFrame(tick);
      else resolve(worst);
    };
    requestAnimationFrame(tick);
  }));
  expect(await notchBottom(page)).toBe(900 - 8);
  expect(drift).toBeLessThan(1);

  // Trocar de destino continua animado: no quadro seguinte ao clique, a pílula ainda viaja.
  const target = nav(page).getByRole('button', { name: 'Assistente', exact: true });
  await target.click();
  const offset = await target.evaluate((button) => new Promise<number>((resolve) => requestAnimationFrame(() => {
    const pill = button.querySelector(':scope > span:first-child')!.getBoundingClientRect();
    resolve(Math.abs(pill.left - button.getBoundingClientRect().left));
  })));
  expect(offset).toBeGreaterThan(1);
});

test('o aviso da automática aparece numa região que já estava na página', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('hibi.ui.navigation-position.v1', 'top'));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await openSettings(page);
  const region = group(page, 'Menu de navegação').locator('xpath=..').getByRole('status').first();
  await expect(region).toBeEmpty();
  await region.evaluate((element) => { (element as HTMLElement & { hibiMarker?: string }).hibiMarker = 'a mesma região'; });
  await choose(page, 'Menu de navegação', 'Automática');
  await expect(region).toHaveText('Agora em cima: o mascote não está nesta tela.');
  expect(await region.evaluate((element) => (element as HTMLElement & { hibiMarker?: string }).hibiMarker)).toBe('a mesma região');
});

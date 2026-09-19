import { expect, test, type Page } from '@playwright/test';

// A navegação oficial da nova UI (U03): a Adaptive Notch Navigation Bar do preview aprovado no shell real.
const nav = (page: Page) => page.getByRole('navigation', { name: 'Navegação principal' });
const trail = (page: Page) => page.getByRole('navigation', { name: 'Onde você está' });
const current = (page: Page) => nav(page).locator('[aria-current="page"]:visible');
const openMore = async (page: Page) => { await nav(page).getByRole('button', { name: 'Mais seções' }).click(); };

// As asas do preview (`adaptive-notch-navigation-bar.tsx`), em cima e embaixo.
const LEFT_WING = { top: 'M 0 0 C 11.046 0 20 8.954 20 20 H 21 V -1 H 0 Z', bottom: 'M 0 20 C 11.046 20 20 11.046 20 0 H 21 V 21 H 0 Z' };
const RIGHT_WING = { top: 'M 20 0 C 8.954 0 0 8.954 0 20 H -1 V -1 H 20 Z', bottom: 'M 20 20 C 8.954 20 0 11.046 0 0 H -1 V 21 H 20 Z' };

// O algoritmo do Chromium para as regiões de arrastar a janela (`LocalFrameView::CollectDraggableRegions`):
// ordem da árvore, uma região por caixa com `app-region` diferente de `none`, e a mais recente vence.
const regionAt = (page: Page, x: number, y: number) => page.evaluate(([px, py]) => {
  let hit = 'nenhuma';
  for (const element of document.querySelectorAll('*')) {
    if (element instanceof SVGElement && !(element instanceof SVGSVGElement)) continue;
    const style = getComputedStyle(element);
    const mode = style.getPropertyValue('app-region');
    if (!mode || mode === 'none' || style.visibility !== 'visible' || style.display === 'inline' || !element.getClientRects().length) continue;
    const box = element.getBoundingClientRect();
    if (px >= box.left && px < box.right && py >= box.top && py < box.bottom) hit = mode;
  }
  return hit;
}, [x, y]);
const centerOf = async (page: Page, selector: string) => { const box = (await page.locator(selector).boundingBox())!; return [box.x + box.width / 2, box.y + box.height / 2] as const; };

test('cada destino, Ajustes e cada item do Mais abrem a tela real, e a trilha diz onde a pessoa está', async ({ page }) => {
  await page.goto('/');
  const places: { name: string; via: 'bar' | 'more'; marked: string | null; path: string; screen: (page: Page) => ReturnType<Page['locator']> }[] = [
    { name: 'Agenda', via: 'bar', marked: 'Agenda', path: 'Agenda', screen: (p) => p.locator('.agenda-view') },
    { name: 'Tarefas', via: 'bar', marked: 'Tarefas', path: 'Tarefas', screen: (p) => p.getByLabel('New task title') },
    { name: 'Notas', via: 'bar', marked: 'Notas', path: 'Notas', screen: (p) => p.getByRole('heading', { level: 1, name: 'Notes' }) },
    { name: 'Taby', via: 'bar', marked: 'Taby', path: 'Taby', screen: (p) => p.getByRole('heading', { level: 1, name: 'Local assistant' }) },
    { name: 'Hoje', via: 'bar', marked: 'Hoje', path: 'Hoje', screen: (p) => p.locator('.home-view') },
    { name: 'Ajustes', via: 'bar', marked: 'Ajustes', path: 'Ajustes', screen: (p) => p.getByRole('heading', { level: 1, name: 'Settings' }) },
    { name: 'Foco', via: 'more', marked: null, path: 'Foco', screen: (p) => p.locator('.focus-view') },
    { name: 'Lembretes', via: 'more', marked: 'Tarefas', path: 'Tarefas / Lembretes', screen: (p) => p.getByRole('heading', { level: 1, name: 'Reminders' }) },
    { name: 'Hábitos', via: 'more', marked: 'Hoje', path: 'Hoje / Hábitos', screen: (p) => p.getByRole('heading', { level: 1, name: 'Habits' }) },
    { name: 'Metas', via: 'more', marked: 'Hoje', path: 'Hoje / Metas', screen: (p) => p.getByRole('heading', { level: 1, name: 'Goals' }) },
    { name: 'Revisão', via: 'more', marked: 'Hoje', path: 'Hoje / Revisão', screen: (p) => p.getByRole('heading', { level: 1, name: 'Review' }) },
    { name: 'Estatísticas', via: 'more', marked: 'Hoje', path: 'Hoje / Estatísticas', screen: (p) => p.getByRole('heading', { level: 1, name: 'Estatísticas' }) },
    { name: 'Ajuda', via: 'more', marked: 'Ajustes', path: 'Ajustes / Ajuda', screen: (p) => p.getByRole('heading', { level: 1, name: 'Help' }) },
    { name: 'Eventos', via: 'more', marked: 'Ajustes', path: 'Ajustes / Eventos', screen: (p) => p.getByRole('heading', { level: 1, name: 'Instrumentation' }) },
    { name: 'Feedback', via: 'more', marked: 'Ajustes', path: 'Ajustes / Feedback', screen: (p) => p.getByRole('heading', { level: 1, name: 'Feedback' }) },
    { name: 'Atualizações', via: 'more', marked: 'Ajustes', path: 'Ajustes / Atualizações', screen: (p) => p.getByRole('heading', { level: 1, name: 'Updates' }) },
    { name: 'Hardware', via: 'more', marked: 'Ajustes', path: 'Ajustes / Hardware', screen: (p) => p.getByRole('heading', { level: 1, name: 'Hardware' }) },
  ];
  for (const place of places) {
    if (place.via === 'bar') await nav(page).getByRole('button', { name: place.name, exact: true }).click();
    else { await openMore(page); await page.getByRole('menuitem', { name: place.name, exact: true }).click(); }
    await expect(place.screen(page), place.name).toBeVisible();
    await expect(trail(page), place.name).toHaveText(`Meu espaço / ${place.path}`);
    // Um lugar só marcado na barra: o destino onde a rota mora, ou nenhum na sessão de foco.
    if (place.marked) await expect(current(page), place.name).toHaveText([place.marked]);
    else await expect(current(page), place.name).toHaveCount(0);
  }
});

test('a barra fica presa à moldura, com as asas do preview, e não cobre o conteúdo', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const notch = page.locator('.notch-center');
  const box = (await notch.boundingBox())!;
  // Moldura de 8 px, notch de 44 px, centralizado.
  expect(box.y).toBe(8);
  expect(box.height).toBe(44);
  expect(Math.abs(box.x + box.width / 2 - 720)).toBeLessThanOrEqual(0.5);
  await expect(notch.locator('svg.right-full path')).toHaveAttribute('d', LEFT_WING.top);
  await expect(notch.locator('svg.left-full path')).toHaveAttribute('d', RIGHT_WING.top);
  // A trilha começa abaixo da banda da barra.
  expect((await trail(page).boundingBox())!.y).toBeGreaterThan(box.y + box.height);
  // Os itens mantêm o respiro do preview: o utilitário do Tailwind vence o reset da nova UI.
  await expect(notch.getByRole('button', { name: 'Agenda', exact: true })).toHaveCSS('padding-left', '14px');
});

test('embaixo, a barra espelha a de cima e a última linha fica acima dela', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?overlay=ui-navigation&position=bottom');
  const notch = page.locator('.notch-center');
  const box = (await notch.boundingBox())!;
  expect(box.y + box.height).toBe(900 - 8);
  await expect(notch.locator('svg.right-full path')).toHaveAttribute('d', LEFT_WING.bottom);
  await expect(notch.locator('svg.left-full path')).toHaveAttribute('d', RIGHT_WING.bottom);
  // Os botões do macOS ficam no canto de cima: a trilha abre espaço para eles.
  await expect(page.locator('.hibi-topbar')).toHaveCSS('padding-left', '84px');
  await page.locator('.notch-viewport').evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const last = (await page.locator('[data-last-line]').boundingBox())!;
  expect(last.y + last.height).toBeLessThanOrEqual(box.y);
});

test('abaixo de 1280 px a barra vira a ilha compacta, que abre, navega, fecha e devolve o foco', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 620 });
  await page.goto('/');
  await expect(page.locator('.notch-center')).toBeHidden();
  const trigger = nav(page).getByRole('button', { name: /mudar de seção/ });
  await expect(trigger).toHaveAccessibleName('Hoje, mudar de seção');
  // Fechado, o menu fica fora do Tab: depois do botão vêm as ações, e depois delas o foco sai da barra, sem
  // passar pelos destinos escondidos.
  await trigger.focus();
  await page.keyboard.press('Tab');
  await expect(nav(page).getByRole('button', { name: 'Comandos' })).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(nav(page).getByRole('button', { name: 'Ajustes', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('[data-notch-drawer]'))).toBe(false);

  // Aberto, o foco entra no menu, no destino atual; escolher navega, fecha e volta ao botão.
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const list = page.locator('[data-notch-drawer] ul');
  await expect(list.getByRole('button', { name: 'Hoje', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(list.getByRole('button', { name: 'Agenda', exact: true })).toBeFocused();
  await list.getByRole('button', { name: 'Notas', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Notes' })).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAccessibleName('Notas, mudar de seção');

  // Escape fecha sem escolher e devolve o foco.
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();

  // Clicar fora fecha, sem navegar.
  await trigger.click();
  await page.mouse.click(40, 500);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trail(page)).toHaveText('Meu espaço / Notas');
});

test('setas, Home e End percorrem a barra, e o Mais abre e fecha pelo teclado', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await nav(page).getByRole('button', { name: 'Hoje', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(nav(page).getByRole('button', { name: 'Ajustes', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(nav(page).getByRole('button', { name: 'Hoje', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowLeft');
  const more = nav(page).getByRole('button', { name: 'Mais seções' });
  await expect(more).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu', { name: 'Mais seções' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(more).toBeFocused();
});

test('os ícones da barra têm dica, e um modal das telas atuais cobre a barra', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  // O React Aria só mostra a dica no hover quando a última interação foi com o ponteiro, como na mão de
  // quem usa: o mouse anda pela janela antes de parar no ícone.
  await page.mouse.move(40, 400);
  await nav(page).getByRole('button', { name: 'Mais seções' }).hover();
  await expect(page.getByRole('tooltip').filter({ hasText: 'Mais seções' })).toBeVisible();
  await nav(page).getByRole('button', { name: 'Comandos' }).hover();
  await expect(page.getByRole('tooltip').filter({ hasText: 'Comandos' })).toBeVisible();

  await nav(page).getByRole('button', { name: 'Comandos' }).click();
  await expect(page.getByRole('dialog', { name: 'Paleta de comandos' })).toBeVisible();
  const [x, y] = await centerOf(page, '.notch-center');
  const onTop = await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest('.overlay, .notch-center')?.className ?? '', [x, y]);
  expect(onTop).toContain('overlay');
});

test('a janela se arrasta pela faixa do topo, nunca pelos botões nem pelo conteúdo', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  expect(await regionAt(page, 300, 3)).toBe('drag');
  expect(await regionAt(page, 300, 30)).toBe('drag');
  expect(await regionAt(page, 1100, 30)).toBe('drag');
  expect(await regionAt(page, 300, 400)).toBe('nenhuma');
  expect(await regionAt(page, 60, 117)).toBe('nenhuma');
  const [hx, hy] = await centerOf(page, '.notch-center li:first-child button');
  expect(await regionAt(page, hx, hy)).toBe('no-drag');
  const [sx, sy] = await centerOf(page, '.notch-actions button:last-child');
  expect(await regionAt(page, sx, sy)).toBe('no-drag');
  // Com um menu aberto, o clique em qualquer lugar é do menu (fechar), não da janela.
  await openMore(page);
  await expect(page.getByRole('menu')).toBeVisible();
  expect(await regionAt(page, 300, 30)).toBe('no-drag');
});

test('com "Reduzir movimento", a pílula do destino atual troca de lugar sem animação', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('hibi-motion', 'reduce'));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const target = nav(page).getByRole('button', { name: 'Taby', exact: true });
  await target.click();
  // No quadro seguinte ao clique, a pílula já está inteira no destino novo (com animação, ainda viajaria).
  const offset = await target.evaluate((button) => new Promise<number>((resolve) => requestAnimationFrame(() => {
    const pill = document.querySelector('.notch-center [aria-current="page"] > span:first-child')!.getBoundingClientRect();
    resolve(Math.abs(pill.left - button.getBoundingClientRect().left));
  })));
  expect(offset).toBeLessThan(1);
});

// O Hibi grava o tema na raiz; a preferência do macOS só entra quando a pessoa escolhe "Sistema". Com o macOS
// no escuro e o Hibi no claro, a reserva da variante `dark` do HeroUI pintava o notch de cinza sobre a moldura
// preta.
const ZINC_950 = 'oklch(0.141 0.005 285.823)';
const ZINC_200 = 'oklch(0.92 0.004 286.32)';
for (const [system, hibi, expected] of [['dark', 'light', ZINC_950], ['light', 'dark', ZINC_200]] as const) {
  test.describe(`macOS ${system}, Hibi ${hibi}`, () => {
    test.use({ colorScheme: system });
    test('a barra segue o tema do Hibi, não o do sistema', async ({ page }) => {
      await page.addInitScript((value) => localStorage.setItem('hibi-theme', value), hibi);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', hibi);
      await expect(page.locator('.notch-frame')).toHaveCSS('background-color', expected);
      await expect(page.locator('.notch-center')).toHaveCSS('background-color', expected);
      await expect(page.locator('.notch-center svg').first()).toHaveCSS('color', expected);
    });
  });
}

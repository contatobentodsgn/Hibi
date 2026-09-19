import { expect, test, type Page } from '@playwright/test';

// U05: o diálogo de ação curta, o painel de detalhes, o estado vazio e o atalho redondo, na galeria da nova UI.
const section = (page: Page) => page.getByRole('region', { name: 'Diálogos, detalhes e estados (U05)' });
const status = (page: Page) => section(page).locator('[data-gallery-status]');
const openGallery = async (page: Page, width = 1440, height = 900) => {
  await page.setViewportSize({ width, height });
  await page.goto('/?overlay=ui-gallery');
  await section(page).scrollIntoViewIfNeeded();
};

test('o diálogo de ação curta prende o foco, fecha pelo X, por Escape e por um clique fora, e devolve o foco', async ({ page }) => {
  await openGallery(page);
  const trigger = section(page).getByRole('button', { name: 'Criar algo' });
  const dialog = page.getByRole('dialog', { name: 'O começo de uma ideia.' });

  await trigger.click();
  await expect(dialog).toBeVisible();
  // O Tab dá a volta lá dentro: o fechar e as três escolhas, sem escapar para a página.
  for (let step = 0; step < 6; step += 1) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await dialog.getByRole('button', { name: 'Fechar' }).click();
  await expect(dialog).toHaveCount(0);

  await trigger.click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(40, 450);
  await expect(dialog).toHaveCount(0);

  // Cada escolha faz o que diz e fecha o diálogo.
  await trigger.click();
  await dialog.getByRole('group', { name: 'O que criar' }).getByRole('button', { name: 'Uma nota' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(status(page)).toHaveText('Escolhido: Uma nota');
});

test('o painel de detalhes fica à direita, dentro da moldura, com os dados do item e as ações no pé', async ({ page }) => {
  await openGallery(page);
  const trigger = section(page).getByRole('button', { name: 'Detalhes da tarefa' });
  await trigger.click();
  const panel = page.getByRole('dialog', { name: 'Refinar a identidade do Hibi' });
  await expect(panel).toBeVisible();
  // Parada (a folha entra deslizando), presa à direita, a 8 px da moldura em volta.
  await expect.poll(async () => (await panel.boundingBox())!.x).toBe(1440 - 8 - 400);
  expect(await panel.boundingBox()).toMatchObject({ y: 8, width: 400, height: 900 - 16 });
  await expect(panel.locator('dt')).toHaveText(['Pasta', 'Prazo', 'Duração', 'Categoria']);
  await expect(panel.locator('dd')).toHaveText(['Design', 'Hoje', '60 min', 'Trabalho']);

  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.mouse.click(300, 450);
  await expect(panel).toHaveCount(0);

  await trigger.click();
  await panel.getByRole('button', { name: 'Concluir' }).click();
  await expect(panel).toHaveCount(0);
  await expect(status(page)).toHaveText('Concluída: Refinar a identidade do Hibi');
});

test('em janela estreita, o painel de detalhes sobe de baixo, na largura toda', async ({ page }) => {
  await openGallery(page, 390, 844);
  await section(page).getByRole('button', { name: 'Detalhes da tarefa' }).click();
  const panel = page.getByRole('dialog', { name: 'Refinar a identidade do Hibi' });
  await expect(panel).toBeVisible();
  await expect.poll(async () => { const box = (await panel.boundingBox())!; return Math.round(box.y + box.height); }).toBe(844 - 8);
  expect(await panel.boundingBox()).toMatchObject({ x: 8, width: 390 - 16 });
});

test('as sobreposições usam o véu do preview, e o fechar fala o idioma do Hibi', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('hibi-language', 'en'));
  await openGallery(page);
  await section(page).getByRole('button', { name: 'Criar algo' }).click();
  const veil = page.locator('.hibi-overlay-backdrop');
  await expect(veil).toHaveCSS('background-color', 'rgba(32, 32, 43, 0.22)');
  await expect(veil).toHaveCSS('backdrop-filter', 'blur(5px)');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Close' })).toBeVisible();
});

test('o estado vazio e o atalho redondo levam a algum lugar, pelo mouse e pelo teclado', async ({ page }) => {
  await openGallery(page);
  await expect(section(page).getByRole('heading', { level: 3, name: 'Nada pendente por aqui.' })).toBeVisible();
  await section(page).getByRole('button', { name: 'Criar tarefa' }).click();
  await expect(status(page)).toHaveText('Criar tarefa');

  const shortcut = section(page).getByRole('button', { name: 'Ver tarefas da semana' });
  await shortcut.focus();
  await page.keyboard.press('Enter');
  await expect(status(page)).toHaveText('Atalho: Ver tarefas da semana');
});

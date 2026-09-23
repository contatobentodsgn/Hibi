import { test, expect, type Page } from '@playwright/test';

// A fundação da nova UI (U01 e U02): o HeroUI funciona com os tokens do Hibi, e o CSS da nova UI e o das
// telas atuais não se misturam, em nenhuma das duas direções. Cada teste segura uma barreira de
// `src/styles/heroui.css` ou de `src/ui/redesign/theme.css`. A galeria (`?overlay=ui-gallery`) só existe
// no desenvolvimento, que é onde o e2e roda.

const gallery = async (page: Page, theme: 'light' | 'dark' = 'light', tint = 'lavender') => {
  await page.addInitScript(({ value, tone }) => { localStorage.setItem('hibi-theme', value); localStorage.setItem('hibi-tint', tone); }, { value: theme, tone: tint });
  await page.goto('/?overlay=ui-gallery');
  await expect(page.locator('[data-gallery]')).toBeVisible();
};

const openLegacyUpdates = async (page: Page) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Comandos' }).click();
  await page.getByRole('dialog', { name: 'Paleta de comandos' }).getByRole('combobox').fill('/updates');
  await page.keyboard.press('Enter');
  await expect(page.locator('.legacy-surface')).toBeVisible();
};

// Luminância relativa (WCAG) de uma cor CSS qualquer — oklch e color-mix inclusive —, resolvida pelo navegador.
const contrastOf = (page: Page, pairs: Array<[string, string]>) => page.evaluate((list) => {
  const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
  const channel = (value: number) => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const luminance = (color: string) => { probe.clearRect(0, 0, 1, 1); probe.fillStyle = '#fff'; probe.fillRect(0, 0, 1, 1); probe.fillStyle = color; probe.fillRect(0, 0, 1, 1); const [r, g, b] = probe.getImageData(0, 0, 1, 1).data; return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!); };
  return list.map(([text, background]) => { const [a, b] = [luminance(text), luminance(background)].sort((x, y) => y - x); return Math.round(((a! + 0.05) / (b! + 0.05)) * 100) / 100; });
}, pairs);

test('o HeroUI funciona: botão, campo e popover desenhado dentro da nova UI', async ({ page }) => {
  await gallery(page);
  await page.getByRole('button', { name: 'Salvar 0' }).click();
  await expect(page.getByRole('button', { name: 'Salvar 1' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Nome da tarefa' }).first().fill('Kabrito');
  await expect(page.getByRole('textbox', { name: 'Nome da tarefa' }).first()).toHaveValue('Kabrito');

  await page.getByRole('button', { name: 'Ver resumo' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ver resumo' });
  await expect(dialog).toHaveText('Três tarefas para hoje, uma atrasada.');
  // O popover é desenhado dentro da raiz da nova UI (`HibiUiRoot`), e não no `body`.
  expect(await dialog.evaluate((node) => Boolean(node.closest('.hibi-ui [data-hibi-portal]')))).toBe(true);
  // Dentro da nova UI, a cor de borda vem do tema, e não da cor do texto.
  const borders = await dialog.evaluate((node) => { const style = getComputedStyle(node); return { border: style.borderTopColor, text: style.color }; });
  expect(borders.border).not.toBe(borders.text);
});

test('menus e listas também abrem dentro da nova UI, e o Escape fecha o diálogo e devolve o foco', async ({ page }) => {
  await gallery(page);
  await page.getByRole('button', { name: 'Mais ações' }).click();
  const menu = page.getByRole('menu', { name: 'Mais ações' });
  await expect(menu).toBeVisible();
  expect(await menu.evaluate((node) => Boolean(node.closest('[data-hibi-portal]')))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  const trigger = page.getByRole('button', { name: 'Abrir diálogo' });
  await trigger.click();
  await expect(page.getByRole('dialog', { name: 'Mover tarefa' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Mover tarefa' })).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('pelo teclado, o foco aparece no controle', async ({ page }) => {
  await gallery(page);
  await page.getByRole('button', { name: 'Salvar 0' }).focus();
  await page.keyboard.press('Tab');
  const focused = page.locator(':focus');
  await expect(focused).toHaveAttribute('data-focus-visible', 'true');
  expect(await focused.evaluate((node) => getComputedStyle(node).boxShadow)).not.toBe('none');
});

test('no tema escuro, o texto da nova UI é claro sobre o fundo escuro', async ({ page }) => {
  await gallery(page, 'dark');
  await page.getByRole('button', { name: 'Ver resumo' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ver resumo' });
  await expect(dialog).toBeVisible();
  // O diálogo é transparente; o fundo pintado é o do popover em volta dele.
  const colors = await dialog.evaluate((node) => {
    let surface: Element | null = node;
    let background = 'rgba(0, 0, 0, 0)';
    while (surface && /^rgba\(0, 0, 0, 0\)$|^transparent$/.test(background)) { background = getComputedStyle(surface).backgroundColor; surface = surface.parentElement; }
    return { text: getComputedStyle(node).color, background };
  });
  const [ratio] = await contrastOf(page, [[colors.text, colors.background]]);
  expect(ratio).toBeGreaterThanOrEqual(4.5);
});

// O preview aprovado ficava entre 4,0:1 e 4,3:1 no texto branco sobre o acento e no texto secundário.
for (const theme of ['light', 'dark'] as const) {
  for (const tint of ['lavender', 'blue', 'teal', 'mint', 'forest', 'amber', 'coral', 'rose', 'plum', 'graphite']) {
    test(`contraste de texto normal (4,5:1) no tema ${theme}, tom ${tint}`, async ({ page }) => {
      await gallery(page, theme, tint);
      const read = (selector: string) => page.locator(selector).first().evaluate((node) => ({ text: getComputedStyle(node).color, background: getComputedStyle(node).backgroundColor }));
      const primary = await read('.button--primary');
      const root = await page.locator('[data-gallery]').evaluate((node) => {
        const style = getComputedStyle(node);
        const accentInk = style.getPropertyValue('--accent-foreground');
        return { ink: style.color, canvas: style.getPropertyValue('--hibi-canvas'), paper: style.getPropertyValue('--hibi-paper'), muted: style.getPropertyValue('--hibi-ink-muted'), accent: style.getPropertyValue('--hibi-accent'), accentInk };
      });
      // O acento usa tinta branca no tema claro e tinta escura no tema escuro.
      const ratios = await contrastOf(page, [[primary.text, primary.background], [root.ink, root.canvas], [root.ink, root.paper], [root.muted, root.canvas], [root.muted, root.paper], [root.accentInk, root.accent]]);
      for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  }
}

test('cada uma das dez cores vira um acento distinto na nova UI', async ({ page }) => {
  const accents = new Set<string>();
  for (const tint of ['lavender', 'blue', 'teal', 'mint', 'forest', 'amber', 'coral', 'rose', 'plum', 'graphite']) {
    const tab = await page.context().newPage();
    await gallery(tab, 'light', tint);
    accents.add(await tab.locator('[data-gallery] .switch__control').first().evaluate((node) => getComputedStyle(node.closest('.hibi-ui')!).getPropertyValue('--hibi-accent').trim()));
    await tab.close();
  }
  expect(accents.size).toBe(10);
});

// No preview, a ação principal ("Entrar em foco") é o botão quase preto, e o acento fica nos detalhes.
test('a ação principal é o botão escuro do preview, nos dois temas', async ({ page }) => {
  for (const theme of ['light', 'dark'] as const) {
    const tab = await page.context().newPage();
    await gallery(tab, theme);
    const colors = await tab.locator('.button--primary').first().evaluate((node) => ({ background: getComputedStyle(node).backgroundColor, text: getComputedStyle(node).color }));
    expect(colors, theme).toEqual({ background: 'rgb(36, 36, 40)', text: 'rgb(255, 255, 255)' });
    await tab.close();
  }
});

test('as etiquetas pastéis do preview têm texto legível nos dois temas e com mais contraste', async ({ page }) => {
  for (const theme of ['light', 'dark'] as const) {
    const tab = await page.context().newPage();
    await tab.addInitScript(() => localStorage.setItem('hibi-contrast', 'more'));
    await gallery(tab, theme);
    const pairs = await tab.locator('.hibi-tag').evaluateAll((nodes) => nodes.map((node) => [getComputedStyle(node).color, getComputedStyle(node).backgroundColor] as [string, string]));
    expect(pairs.length).toBeGreaterThanOrEqual(5);
    // Neutra, lavanda, pêssego, azul e menta: cada tom com o seu fundo pastel.
    expect(new Set(pairs.map(([, background]) => background)).size, theme).toBe(5);
    for (const ratio of await contrastOf(tab, pairs)) expect(ratio, theme).toBeGreaterThanOrEqual(4.5);
    await tab.close();
  }
});

test('"Mais contraste" reforça o texto secundário e os contornos da nova UI', async ({ page }) => {
  await gallery(page);
  const read = () => page.locator('[data-gallery]').evaluate((node) => { const style = getComputedStyle(node); return [style.getPropertyValue('--hibi-ink-muted').trim(), style.getPropertyValue('--hibi-line').trim()]; });
  const normal = await read();
  await page.getByText('Mais contraste').click();
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'more');
  expect(await read()).toEqual(['#51515b', '#aaaab3']);
  expect(normal).toEqual(['#6e6e76', '#e9e9ed']);
});

for (const how of ['no Hibi', 'no sistema'] as const) {
  test(`"Reduzir movimento" ${how} deixa as transições da nova UI instantâneas`, async ({ page }) => {
    if (how === 'no sistema') await page.emulateMedia({ reducedMotion: 'reduce' });
    else await page.addInitScript(() => localStorage.setItem('hibi-motion', 'reduce'));
    await gallery(page);
    const durations = await page.locator('.button--secondary').first().evaluate((node) => getComputedStyle(node).transitionDuration.split(', '));
    for (const duration of durations) expect(parseFloat(duration)).toBeLessThan(0.001);
  });
}

test('o cartão tem o respiro e o raio do painel do preview', async ({ page }) => {
  await gallery(page);
  const card = await page.locator('[data-reference="moment"]').evaluate((node) => { const style = getComputedStyle(node); return { padding: style.padding, radius: style.borderTopLeftRadius }; });
  expect(card).toEqual({ padding: '24px', radius: '24px' });
});

// A fonte da nova UI é a do sistema (a do preview); a Inter das telas atuais vazava pelo reset do Tailwind.
test('a nova UI usa a fonte do sistema, como o preview', async ({ page }) => {
  await gallery(page);
  const families = await page.locator('[data-gallery] :is(.card__title, .button, .card__description, .label)').evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).fontFamily));
  expect(families.length).toBeGreaterThan(3);
  for (const family of families) expect(family).toMatch(/^-apple-system/);
});

// O HeroUI calcula o hover e as versões suaves na raiz, a partir do acento da raiz — o laranja das telas atuais.
test('o hover e as versões suaves seguem o acento da nova UI', async ({ page }) => {
  await gallery(page);
  const colors = await page.locator('[data-gallery]').evaluate((root) => ['--accent', '--accent-hover', '--accent-soft-foreground'].map((name) => {
    const probe = document.createElement('div');
    probe.style.background = `var(${name})`;
    root.appendChild(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return color;
  }));
  const canvas = await page.evaluate((list) => {
    const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
    return list.map((color) => { context.fillStyle = '#fff'; context.fillRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)]; });
  }, colors);
  // O roxo da nova UI tem mais azul que vermelho; o laranja das telas atuais, o contrário.
  for (const [red, , blue] of canvas) expect(blue!).toBeGreaterThan(red!);
});

test('o tema é aplicado antes de a tela aparecer', async ({ page }) => {
  // Quadro a quadro, antes de cada desenho: nenhum quadro pode ter conteúdo sem o tema escolhido.
  await page.addInitScript(() => {
    localStorage.setItem('hibi-theme', 'dark');
    const frames: Array<{ content: boolean; theme: string | null }> = [];
    (window as unknown as { __frames: typeof frames }).__frames = frames;
    const tick = () => { const root = document.getElementById('root'); frames.push({ content: Boolean(root?.childElementCount), theme: document.documentElement.getAttribute('data-theme') }); if (frames.length < 90) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await page.goto('/');
  await expect(page.locator('.redesign-surface')).toBeVisible();
  await page.waitForTimeout(500);
  const frames = await page.evaluate(() => (window as unknown as { __frames: Array<{ content: boolean; theme: string | null }> }).__frames);
  expect(frames.some((frame) => frame.content)).toBe(true);
  expect(frames.filter((frame) => frame.content && frame.theme !== 'dark')).toEqual([]);
});

test('o CSS das telas atuais não entra na nova UI', async ({ page }) => {
  await gallery(page, 'dark');
  // As regras globais de `button` das telas atuais davam aos botões do HeroUI uma borda grossa.
  const button = await page.locator('.button--secondary').first().evaluate((node) => { const style = getComputedStyle(node); return [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth]; });
  expect(button).toEqual(['0px', '0px', '0px', '0px']);
  // `.outline` é classe das telas atuais (`color: #222`) e utilitário do Tailwind: aqui dentro vale o utilitário.
  const sample = await page.locator('[data-utility-sample]').evaluate((node) => { const style = getComputedStyle(node); return { outline: style.outlineStyle, display: style.display, color: style.color, ink: getComputedStyle(node.closest('.hibi-ui')!).color }; });
  expect(sample.outline).toBe('solid');
  expect(sample.display).toBe('block');
  expect(sample.color).toBe(sample.ink);
});

// Um elemento das telas atuais, montado dentro de `.legacy-surface`, e as propriedades que ele recebe.
const legacyStyle = (page: Page, markup: string, properties: string[]) =>
  page.evaluate(({ html, names }) => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    document.querySelector('.legacy-surface')!.appendChild(wrapper);
    const style = getComputedStyle(wrapper.firstElementChild!);
    const result = Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name)]));
    wrapper.remove();
    return result;
  }, { html: markup, names: properties });

test('as telas atuais não ganham os utilitários do Tailwind que a nova UI usa', async ({ page }) => {
  await openLegacyUpdates(page);
  // A galeria usa `outline` e `block` como utilitários; nas telas atuais eles são classes de botão.
  expect(await legacyStyle(page, '<button class="outline">Cancelar</button>', ['outline-style'])).toEqual({ 'outline-style': 'none' });
  expect(await legacyStyle(page, '<span class="block">x</span>', ['display'])).toEqual({ display: 'inline' });
});

test('as classes que o HeroUI e as telas atuais compartilham ficam com o desenho de antes', async ({ page }) => {
  await openLegacyUpdates(page);
  // O Tag do HeroUI trava a seleção do texto; o chip de pasta das telas atuais nunca travou.
  expect(await legacyStyle(page, '<span class="tag">Bento</span>', ['user-select', 'position'])).toEqual({ 'user-select': 'auto', position: 'static' });
  expect(await legacyStyle(page, '<div class="empty-state">Nada</div>', ['user-select'])).toEqual({ 'user-select': 'auto' });
  // A borda de um elemento das telas atuais continua na cor do texto, como sempre.
  expect(await legacyStyle(page, '<div style="border-style: solid; color: rgb(10, 20, 30)">x</div>', ['border-top-color'])).toEqual({ 'border-top-color': 'rgb(10, 20, 30)' });
  // O reset do Tailwind vale só dentro da nova UI: nas telas atuais, uma lista mantém o marcador do navegador.
  expect(await legacyStyle(page, '<ul><li>item</li></ul>', ['list-style-type'])).toEqual({ 'list-style-type': 'disc' });
});

test('no tema escuro, o resumo de Tarefas continua claro e legível', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('hibi-theme', 'dark'));
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: 'Tarefas' }).click();
  const summary = page.locator('.tasks-screen__summary');
  await expect(summary).toBeVisible();
  expect(await summary.evaluate((node) => getComputedStyle(node).color)).not.toBe(await summary.evaluate((node) => getComputedStyle(node).backgroundColor));
});

test('na janela estreita (equivalente a zoom de 200%), a galeria não rola para o lado', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 900 });
  await gallery(page);
  await page.getByText('Textos longos').click();
  await expect(page.getByRole('switch', { name: 'Textos longos' })).toBeChecked();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

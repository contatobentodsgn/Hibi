import { test, expect, type Page } from '@playwright/test';

// U01 da nova UI: o HeroUI funciona, e a integração não alcança as telas atuais nem as janelas do notch e
// da barra, que usam o mesmo CSS. Cada teste abaixo segura uma das barreiras de `src/styles/heroui.css`.

test('o HeroUI funciona: botão, campo e popover desenhado dentro da UI nova', async ({ page }) => {
  await page.goto('/?overlay=ui-probe');
  const probe = page.locator('[data-probe="heroui"]');
  await expect(probe).toBeVisible();

  await page.getByRole('button', { name: 'Pressionado 0' }).click();
  await expect(page.getByRole('button', { name: 'Pressionado 1' })).toBeVisible();

  await page.getByRole('textbox', { name: 'Nome' }).fill('Kabrito');
  await page.getByRole('button', { name: 'Abrir popover' }).click();
  const dialog = page.getByRole('dialog', { name: 'Popover de prova' });
  await expect(dialog).toHaveText('Olá, Kabrito');
  // O popover é desenhado no contêiner `.hibi-ui`, e não no `body`: só lá valem as regras da UI nova.
  expect(await dialog.evaluate((node) => Boolean(node.closest('.hibi-ui')))).toBe(true);
  // Dentro da UI nova, a cor de borda vem do tema do HeroUI, e não da cor do texto.
  const borders = await dialog.evaluate((node) => { const style = getComputedStyle(node); return { border: style.borderTopColor, text: style.color }; });
  expect(borders.border).not.toBe(borders.text);
});

// Visto no app instalado, no tema escuro: o texto do popover herdava a cor escura da raiz das telas atuais
// e sumia no fundo escuro do HeroUI.
test('no tema escuro, o texto da UI nova é claro sobre o fundo escuro', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('hibi-theme', 'dark'));
  await page.goto('/?overlay=ui-probe');
  await page.getByRole('button', { name: 'Abrir popover' }).click();
  const dialog = page.getByRole('dialog', { name: 'Popover de prova' });
  await expect(dialog).toBeVisible();
  const luminance = await dialog.evaluate((node) => {
    const probe = document.createElement('canvas').getContext('2d')!;
    const lum = (color: string) => { probe.fillStyle = color; probe.fillRect(0, 0, 1, 1); const [r, g, b] = probe.getImageData(0, 0, 1, 1).data; return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
    let surface: Element | null = node; let background = 'rgba(0, 0, 0, 0)';
    while (surface && /rgba\(0, 0, 0, 0\)|transparent/.test(background)) { background = getComputedStyle(surface).backgroundColor; surface = surface.parentElement; }
    return { text: lum(getComputedStyle(node).color), background: lum(background) };
  });
  expect(luminance.text).toBeGreaterThan(0.6);
  expect(luminance.text - luminance.background).toBeGreaterThan(0.4);
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

test('as telas atuais não ganham utilitários do Tailwind com o nome das suas classes', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.legacy-surface')).toBeVisible();
  // `.outline` é um botão das telas atuais; como utilitário do Tailwind, viraria contorno sólido.
  expect(await legacyStyle(page, '<button class="outline">Cancelar</button>', ['outline-style'])).toEqual({ 'outline-style': 'none' });
});

test('as classes que o HeroUI e as telas atuais compartilham ficam com o desenho de antes', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.legacy-surface')).toBeVisible();
  // O Tag do HeroUI trava a seleção do texto; o chip de pasta das telas atuais nunca travou.
  expect(await legacyStyle(page, '<span class="tag">Bento</span>', ['user-select', 'position'])).toEqual({ 'user-select': 'auto', position: 'static' });
  expect(await legacyStyle(page, '<div class="empty-state">Nada</div>', ['user-select'])).toEqual({ 'user-select': 'auto' });
  // A borda de um elemento das telas atuais continua na cor do texto, como sempre.
  expect(await legacyStyle(page, '<div style="border-style: solid; color: rgb(10, 20, 30)">x</div>', ['border-top-color'])).toEqual({ 'border-top-color': 'rgb(10, 20, 30)' });
});

test('no tema escuro, o resumo de Tarefas continua claro e legível', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('hibi-theme', 'dark'));
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: 'Tarefas' }).click();
  const summary = page.locator('.tasks-atelier-summary');
  await expect(summary).toBeVisible();
  expect(await summary.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe('rgb(255, 255, 255)');
});

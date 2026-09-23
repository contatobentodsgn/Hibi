import { expect, test, type Page } from '@playwright/test';

const nav = (page: Page) => page.getByRole('navigation', { name: 'Navegação principal' });

async function openSettings(page: Page) {
  await page.goto('/');
  await nav(page).getByRole('button', { name: 'Ajustes', exact: true }).click();
}

test('as dez cores aparecem, e a escolhida é aplicada e guardada', async ({ page }) => {
  await openSettings(page);
  // "Um toque de cor", na Aparência da nova UI (U04): uma amostra por tom, com o nome para o leitor de tela.
  const options = page.getByRole('radiogroup', { name: 'Um toque de cor' });
  const names = await options.getByRole('radio').evaluateAll((inputs) => inputs.map((input) => input.getAttribute('aria-label') ?? input.closest('[aria-label]')?.getAttribute('aria-label')));
  expect(names).toEqual(['Lavanda', 'Azul', 'Turquesa', 'Menta', 'Floresta', 'Âmbar', 'Coral', 'Rosa', 'Ameixa', 'Grafite']);
  // Sem escolha feita, o tom é Lavanda, o padrão da interface.
  await expect(options.getByRole('radio', { name: 'Lavanda' })).toBeChecked();

  const blue = options.getByRole('radio', { name: 'Azul' });
  await blue.check({ force: true });
  await expect(blue).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-tint', 'blue');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-tint', 'blue');
});

test('um tom escolhido antes vira o mais próximo do preview', async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('migrou')) { localStorage.setItem('hibi-tint', 'ocean'); sessionStorage.setItem('migrou', '1'); } });
  await openSettings(page);
  await expect(page.locator('html')).toHaveAttribute('data-tint', 'blue');
  await expect(page.getByRole('radiogroup', { name: 'Um toque de cor' }).getByRole('radio', { name: 'Azul' })).toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem('hibi-tint'))).toBe('blue');
});

test('"Mais contraste" e "Reduzir movimento" valem na hora e ficam guardados', async ({ page }) => {
  await openSettings(page);
  const contrast = page.getByRole('switch', { name: /Mais contraste/ });
  const motion = page.getByRole('switch', { name: /Reduzir movimento/ });
  await expect(contrast).not.toBeChecked();
  const before = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim());

  await contrast.check({ force: true });
  await motion.check({ force: true });
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'more');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
  // Nas telas atuais também: o texto secundário fica mais forte, e as animações param.
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim())).not.toBe(before);
  await page.evaluate(() => { const marker = document.createElement('div'); marker.dataset.testid = 'motion-proof'; marker.style.animation = 'hibi-focus-pulse 2.4s ease-in-out infinite'; document.body.append(marker); });
  await expect(page.getByTestId('motion-proof')).toHaveCSS('animation-duration', '1e-05s');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'more');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
});

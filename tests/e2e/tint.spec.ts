import { expect, test, type Page } from '@playwright/test';

const nav = (page: Page) => page.getByRole('navigation', { name: 'Navegação principal' });

async function openSettings(page: Page) {
  await page.goto('/');
  await nav(page).getByRole('button', { name: 'Ajustes', exact: true }).click();
}

test('os quatro tons do preview aparecem, e o escolhido é aplicado e guardado', async ({ page }) => {
  await openSettings(page);
  const options = page.getByRole('radiogroup', { name: 'Cor de destaque' });
  await expect(options.getByRole('radio')).toHaveText(['Lavanda', 'Azul', 'Menta', 'Pêssego']);
  // Sem escolha feita, o tom é Lavanda, o padrão do preview.
  await expect(options.getByRole('radio', { name: 'Lavanda' })).toHaveAttribute('aria-checked', 'true');

  const blue = options.getByRole('radio', { name: 'Azul' });
  await blue.click();
  await expect(blue).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-tint', 'blue');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-tint', 'blue');
});

test('um tom escolhido antes vira o mais próximo do preview', async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('migrou')) { localStorage.setItem('hibi-tint', 'ocean'); sessionStorage.setItem('migrou', '1'); } });
  await openSettings(page);
  await expect(page.locator('html')).toHaveAttribute('data-tint', 'blue');
  await expect(page.getByRole('radiogroup', { name: 'Cor de destaque' }).getByRole('radio', { name: 'Azul' })).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => localStorage.getItem('hibi-tint'))).toBe('blue');
});

test('"Mais contraste" e "Reduzir movimento" valem na hora e ficam guardados', async ({ page }) => {
  await openSettings(page);
  const contrast = page.getByRole('switch', { name: /Mais contraste/ });
  const motion = page.getByRole('switch', { name: /Reduzir movimento/ });
  await expect(contrast).toHaveAttribute('aria-checked', 'false');
  const before = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim());

  await contrast.click();
  await motion.click();
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

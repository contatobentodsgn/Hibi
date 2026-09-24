import { expect, test } from '@playwright/test';

test('a keyboard-focused week slot has a visible focus indicator', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Comandos', exact: true }).click();
  await page.getByRole('combobox', { name: 'Digite um comando ou pergunte ao assistente' }).fill('/week');
  await page.keyboard.press('Enter');

  const slot = page.locator('[role="button"][aria-label^="Adicionar bloco"]').first();
  await slot.focus();
  await expect(slot).toBeFocused();
  await expect(slot).toHaveCSS('outline-style', 'solid');
});

test('reduced motion makes injected decorative animation effectively instant', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.evaluate(() => {
    const marker = document.createElement('div');
    marker.dataset.testid = 'motion-proof';
    marker.style.animation = 'hibi-focus-pulse 2.4s ease-in-out infinite';
    document.body.append(marker);
  });

  await expect(page.getByTestId('motion-proof')).toHaveCSS('animation-duration', '1e-05s');
});

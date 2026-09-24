import { test, expect } from '@playwright/test';

test('a mascote varia o repouso e reinicia a sequência depois de uma sessão de foco', async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 8, 23, 10, 0, 0) });
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name: 'Navegação principal' });
  await navigation.getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Foco', exact: true }).click();

  const mascot = page.locator('.companion-animation-video');
  await expect(mascot).toHaveAttribute('src', '/mascot/idle.mp4');
  await page.clock.runFor(30_000);
  await expect(mascot).toHaveAttribute('src', '/mascot/idle_curious.mp4');
  await page.clock.runFor(30_000);
  await expect(mascot).toHaveAttribute('src', '/mascot/idle_wander.mp4');
  await page.clock.runFor(240_000);
  await expect(mascot).toHaveAttribute('src', '/mascot/sleep.mp4');

  await page.getByRole('button', { name: 'Começar foco' }).click();
  await expect(mascot).toHaveAttribute('src', '/mascot/focus.mp4');
  await page.getByRole('button', { name: 'Pausar sessão' }).click();
  await expect(mascot).toHaveAttribute('src', '/mascot/idle.mp4');
  await page.clock.runFor(30_000);
  await expect(mascot).toHaveAttribute('src', '/mascot/idle_curious.mp4');
});

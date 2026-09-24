import { expect, test, type Page } from '@playwright/test';

const nav = (page: Page) => page.getByRole('navigation', { name: 'Navegação principal' });
const openMore = async (page: Page, label: string) => {
  await nav(page).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: label, exact: true }).click();
};

test('the shared Agenda summary keeps its four-column layout inside the HeroUI reset boundary', async ({ page }) => {
  await page.goto('/');
  await nav(page).getByRole('button', { name: 'Agenda', exact: true }).click();
  const summary = page.locator('.agenda-availability');
  await expect(summary).toBeVisible();
  const layout = await summary.evaluate((element) => ({
    display: getComputedStyle(element).display,
    columns: getComputedStyle(element).gridTemplateColumns.split(' ').length,
    childDisplay: getComputedStyle(element.firstElementChild!).display,
  }));
  expect(layout).toEqual({ display: 'grid', columns: 4, childDisplay: 'grid' });
});

test('empty rhythm screens keep icon and copy in one centered column', async ({ page }) => {
  await page.goto('/');
  await openMore(page, 'Hábitos');
  const empty = page.locator('.rhythm-list > .hibi-empty-state');
  await expect(empty).toBeVisible();
  const layout = await empty.evaluate((element) => ({
    columns: getComputedStyle(element).gridTemplateColumns.split(' ').length,
    alignment: getComputedStyle(element).textAlign,
    children: element.children.length,
  }));
  expect(layout).toEqual({ columns: 1, alignment: 'center', children: 2 });
});

test('Review is mounted on the redesigned canvas instead of the temporary legacy surface', async ({ page }) => {
  await page.goto('/');
  await openMore(page, 'Revisão');
  await expect(page.locator('.redesign-surface .review-screen')).toBeVisible();
  await expect(page.locator('.legacy-surface .review-screen')).toHaveCount(0);
});

test('assistant conversation history stays within its sidebar instead of overlapping the status panel', async ({ page }) => {
  const timestamp = '2026-09-23T12:00:00.000Z';
  await page.addInitScript(({ timestamp, title }) => {
    localStorage.setItem('hibi-conversations', JSON.stringify([{ id: 'long-history-title', title, createdAt: timestamp, updatedAt: timestamp, messages: [{ role: 'user', text: title, at: timestamp }] }]));
  }, { timestamp, title: 'Uma conversa com um título suficientemente longo para forçar a largura intrínseca da sidebar' });
  await page.goto('/');
  await nav(page).getByRole('button', { name: 'Assistente', exact: true }).click();
  const history = page.locator('.assistant-screen__history');
  const heading = page.locator('.assistant-screen__history-heading');
  await expect(heading).toBeVisible();
  const widths = await Promise.all([history.evaluate((element) => element.getBoundingClientRect().right), heading.evaluate((element) => element.getBoundingClientRect().right)]);
  expect(widths[1]).toBeLessThanOrEqual(widths[0]);
});

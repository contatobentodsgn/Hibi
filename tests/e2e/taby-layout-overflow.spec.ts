import { expect, test } from '@playwright/test';

test('assistant conversation rows and titles stay inside the history sidebar', async ({ page }) => {
  const timestamp = '2026-09-23T12:00:00.000Z';
  const title = 'Uma conversa com um título suficientemente longo para forçar a largura intrínseca da sidebar';
  await page.addInitScript(({ timestamp, title }) => {
    localStorage.setItem('hibi-conversations', JSON.stringify([{ id: 'long-history-title', title, createdAt: timestamp, updatedAt: timestamp, messages: [{ role: 'user', text: title, at: timestamp }] }]));
  }, { timestamp, title });
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Assistente', exact: true }).click();

  const bounds = await page.locator('.taby-screen__history').evaluate((history) => {
    const historyRight = history.getBoundingClientRect().right;
    const headingRight = history.querySelector('.taby-screen__history-heading')!.getBoundingClientRect().right;
    const rows = [...history.querySelectorAll('.taby-screen__conversation-row')];
    return { headingRight, rows: rows.map((row) => ({
      historyRight,
      rowRight: row.getBoundingClientRect().right,
      titleRight: row.querySelector('button:first-child span')!.getBoundingClientRect().right,
      deleteRight: row.querySelector('button:last-child')!.getBoundingClientRect().right,
    })) };
  });

  expect(bounds.headingRight).toBeLessThanOrEqual(bounds.rows[0].historyRight + 1);
  expect(bounds.rows).toHaveLength(1);
  expect(bounds.rows[0].rowRight).toBeLessThanOrEqual(bounds.rows[0].historyRight + 1);
  expect(bounds.rows[0].titleRight).toBeLessThanOrEqual(bounds.rows[0].deleteRight);
  expect(bounds.rows[0].deleteRight).toBeLessThanOrEqual(bounds.rows[0].historyRight + 1);
});

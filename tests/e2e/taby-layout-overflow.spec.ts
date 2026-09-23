import { expect, test } from '@playwright/test';

test('Taby conversation rows and titles stay inside the history sidebar', async ({ page }) => {
  const timestamp = '2026-09-23T12:00:00.000Z';
  const conversations = Array.from({ length: 24 }, (_, index) => {
    const title = `Conversa ${index + 1}: uma reunião de acompanhamento para revisar o projeto e confirmar os próximos passos com a equipe`;
    return { id: `long-history-title-${index}`, title, createdAt: timestamp, updatedAt: timestamp, messages: [{ role: 'user', text: title, at: timestamp }] };
  });
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.addInitScript((conversations) => {
    localStorage.setItem('hibi-conversations', JSON.stringify(conversations));
  }, conversations);
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Taby', exact: true }).click({ force: true });

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
  expect(bounds.rows).toHaveLength(conversations.length);
  expect(bounds.rows.every((row) => row.rowRight <= row.historyRight + 1)).toBe(true);
  expect(bounds.rows.every((row) => row.titleRight <= row.deleteRight)).toBe(true);
  expect(bounds.rows.every((row) => row.deleteRight <= row.historyRight + 1)).toBe(true);
});

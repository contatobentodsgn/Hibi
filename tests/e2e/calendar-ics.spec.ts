import { test, expect } from '@playwright/test';

test('exporta o calendário local como ICS', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export .ics' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('hibi-calendar.ics');
  const path = await download.path();
  expect(path).toBeTruthy();
});

test('importa um evento ICS na semana exibida', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: 'estudo.ics',
    mimeType: 'text/calendar',
    buffer: Buffer.from([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:study-ics-test',
      'DTSTART:20260907T210000',
      'DTEND:20260907T220000',
      'SUMMARY:Evento importado',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n')),
  });
  await expect(page.getByText('Evento importado')).toBeVisible();
});

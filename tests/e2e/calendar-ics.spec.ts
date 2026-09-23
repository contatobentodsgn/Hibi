import { test, expect } from '@playwright/test';

async function goWeek(page: import('@playwright/test').Page) {
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Agenda', exact: true }).click();
  await page.getByRole('tab', { name: 'Semana' }).click();
}

test('exporta o calendário local como ICS', async ({ page }) => {
  await page.goto('/');
  await goWeek(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar .ics' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('pixano-calendar.ics');
  const path = await download.path();
  expect(path).toBeTruthy();
});

// Os eventos importados caem em 07/09/2026 e a Semana abre na data local real: sem fixar o relógio,
// eles só apareceriam na grade enquanto a data real estivesse na mesma semana. Componentes locais.
const seedToday = () => new Date(2026, 8, 7, 10, 0, 0);

test('importa um evento ICS na semana exibida', async ({ page }) => {
  await page.clock.install({ time: seedToday() });
  await page.goto('/');
  await goWeek(page);
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

test('mantém um evento ICS importado após recarregar o app', async ({ page }) => {
  await page.clock.install({ time: seedToday() });
  await page.goto('/');
  await goWeek(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'persistente.ics',
    mimeType: 'text/calendar',
    buffer: Buffer.from(['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:persist-ics-test', 'DTSTART:20260907T220000', 'DTEND:20260907T230000', 'SUMMARY:Evento persistente', 'END:VEVENT', 'END:VCALENDAR'].join('\n')),
  });
  await expect(page.getByText('Evento persistente')).toBeVisible();

  await page.reload();
  await goWeek(page);
  await expect(page.getByText('Evento persistente')).toBeVisible();
});

test('mostra um evento de calendário conectado como somente leitura', async ({ page }) => {
  await page.clock.install({ time: seedToday() });
  await page.addInitScript(() => {
    (window as unknown as { hibiDesktop: Record<string, unknown> }).hibiDesktop = {
      getCalendarSyncState: async () => ({ sources: [{ id: 'apple', provider: 'apple', label: 'Calendário do Mac', state: 'connected' }], calendars: [{ id: 'apple:work', sourceId: 'apple', label: 'Trabalho', mode: 'read-only' }], conflicts: [] }),
      readCalendarSyncEvents: async () => [{ sourceId: 'apple', calendarId: 'apple:work', remoteId: 'remote-1', title: 'Reunião de cliente', startsAt: '2026-09-07T10:00:00', endsAt: '2026-09-07T11:00:00', allDay: false, writable: true }],
    };
  });
  await page.goto('/');
  await goWeek(page);

  const external = page.getByRole('region', { name: 'Agenda externa e conflitos' });
  await expect(external.getByText('Reunião de cliente')).toBeVisible();
  await expect(external.getByText('Somente leitura', { exact: true })).toBeVisible();
  await expect(external.getByRole('button', { name: 'Atualizar' })).toBeVisible();
});

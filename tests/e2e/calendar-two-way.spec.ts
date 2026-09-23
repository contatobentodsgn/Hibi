import { test, expect, type Page } from '@playwright/test';

type Log = { calls: string[] };
// O processo principal decide o que mudou (electron/calendar-sync-service.cjs, com testes próprios). Aqui
// a pergunta é a da tela: o que ela faz com cada lado da lista.
async function installCalendarBridge(page: Page, changes: unknown) {
  await page.addInitScript((initial) => {
    const log: Log = { calls: [] };
    (window as unknown as { calendarE2E: Log }).calendarE2E = log;
    let current = initial as { outgoing: unknown[]; incoming: unknown[] };
    (window as unknown as { hibiDesktop: Record<string, unknown> }).hibiDesktop = {
      getCalendarSyncState: async () => ({ sources: [{ id: 'apple', provider: 'apple', state: 'connected' }], calendars: [{ id: 'apple:casa', sourceId: 'apple', label: 'Casa', mode: 'bidirectional' }], conflicts: [] }),
      readCalendarSyncEvents: async () => { log.calls.push('read'); return []; },
      listCalendarSyncChanges: async () => { log.calls.push('changes'); return current; },
      prepareCalendarUpdate: async (input: { calendarId: string; block: { id: string; startsAt: string; endsAt: string } }) => {
        log.calls.push(`prepare-update:${input.calendarId}:${input.block.id}:${input.block.startsAt}:${input.block.endsAt}`);
        return { id: 'action-1', confirmationId: 'confirm-1', requiresConfirmation: true, calendarId: input.calendarId, summary: 'Aula' };
      },
      executeApprovedCalendarPublish: async (input: { actionId: string; confirmationId: string }) => {
        log.calls.push(`execute:${input.actionId}:${input.confirmationId}`);
        current = { outgoing: [], incoming: [] };
        return { remoteId: 'event-1' };
      },
      acknowledgeCalendarIncoming: async (input: { calendarId: string; block: { id: string; startsAt: string; endsAt: string } }) => {
        log.calls.push(`acknowledge:${input.calendarId}:${input.block.id}:${input.block.startsAt}:${input.block.endsAt}`);
        return { outgoing: [], incoming: [] };
      },
    };
  }, changes);
}
const calls = (page: Page) => page.evaluate(() => (window as unknown as { calendarE2E: Log }).calendarE2E.calls);
const block = (page: Page, id: string) => page.evaluate((wanted) => (JSON.parse(window.localStorage.getItem('hibi-study-data') ?? '{}') as { blocks: { id: string; start: string; end: string }[] }).blocks.find((entry) => entry.id === wanted), id);

async function openIntegrations(page: Page) {
  await page.goto('/');
  await page.evaluate(() => {
    const data = JSON.parse(window.localStorage.getItem('hibi-study-data') ?? '{}');
    data.blocks = [{ id: 'e2e-aula', title: 'Aula', start: '2026-09-21T09:00:00', end: '2026-09-21T10:00:00', category: 'learning' }];
    window.localStorage.setItem('hibi-study-data', JSON.stringify(data));
  });
  await page.reload();
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('button', { name: 'Integrations', exact: true }).click();
}
const changesBox = (page: Page) => page.getByLabel('Alterações entre o Pixano e o calendário');

test('um evento movido no calendário é trazido para o Hibi com um clique, e o vínculo é avisado', async ({ page }) => {
  await installCalendarBridge(page, { outgoing: [], incoming: [{ localId: 'e2e-aula', calendarId: 'apple:casa', summary: 'Aula', start: '2026-09-21T14:00:00', end: '2026-09-21T15:30:00' }] });
  await openIntegrations(page);
  await expect(changesBox(page)).toContainText('“Aula” foi para 21/09 14:00–15:30 no calendário.');
  // A lista vem depois de ler os calendários bidirecionais: é a leitura que atualiza o lado de lá.
  const log = await calls(page);
  expect(log.indexOf('read')).toBeGreaterThanOrEqual(0);
  expect(log.indexOf('read')).toBeLessThan(log.indexOf('changes'));
  expect(await block(page, 'e2e-aula')).toMatchObject({ start: '2026-09-21T09:00:00' });

  await changesBox(page).getByRole('button', { name: 'Trazer para o Pixano' }).click();

  await expect(page.getByText('“Aula” agora está em 21/09 14:00–15:30 no Pixano, como no calendário.')).toBeVisible();
  await expect.poll(() => block(page, 'e2e-aula')).toMatchObject({ start: '2026-09-21T14:00:00', end: '2026-09-21T15:30:00' });
  expect(await calls(page)).toContain('acknowledge:apple:casa:e2e-aula:2026-09-21T14:00:00:2026-09-21T15:30:00');
  await expect(changesBox(page)).toHaveCount(0);
});

test('um bloco editado no Hibi é enviado ao calendário só depois da confirmação', async ({ page }) => {
  await installCalendarBridge(page, { outgoing: [{ localId: 'e2e-aula', calendarId: 'apple:casa', summary: 'Aula' }], incoming: [] });
  await openIntegrations(page);
  await expect(changesBox(page)).toContainText('“Aula” mudou no Pixano.');

  await changesBox(page).getByRole('button', { name: 'Enviar ao calendário' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Confirmar atualização' })).toBeVisible();
  expect((await calls(page)).filter((call) => call.startsWith('execute'))).toEqual([]);
  expect(await calls(page)).toContain('prepare-update:apple:casa:e2e-aula:2026-09-21T09:00:00:2026-09-21T10:00:00');

  await page.getByRole('alert').filter({ hasText: 'Confirmar atualização' }).getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText('O evento foi atualizado com a versão do Pixano.')).toBeVisible();
  expect(await calls(page)).toContain('execute:action-1:confirm-1');
  await expect(changesBox(page)).toHaveCount(0);
});

test('trazer um horário que cai sobre uma demanda move o bloco normalmente: dividir horário não é conflito', async ({ page }) => {
  await installCalendarBridge(page, { outgoing: [], incoming: [{ localId: 'e2e-aula', calendarId: 'apple:casa', summary: 'Aula', start: '2026-09-21T11:00:00', end: '2026-09-21T12:00:00' }] });
  await page.goto('/');
  await page.evaluate(() => {
    const data = JSON.parse(window.localStorage.getItem('hibi-study-data') ?? '{}');
    data.blocks = [
      { id: 'e2e-aula', title: 'Aula', start: '2026-09-21T09:00:00', end: '2026-09-21T10:00:00', category: 'learning' },
      { id: 'e2e-dentista', title: 'Dentista', start: '2026-09-21T11:00:00', end: '2026-09-21T11:30:00', category: 'work' },
    ];
    window.localStorage.setItem('hibi-study-data', JSON.stringify(data));
  });
  await page.reload();
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('button', { name: 'Integrations', exact: true }).click();

  await changesBox(page).getByRole('button', { name: 'Trazer para o Pixano' }).click();

  await expect.poll(() => block(page, 'e2e-aula')).toMatchObject({ start: '2026-09-21T11:00:00', end: '2026-09-21T12:00:00' });
  expect(await calls(page)).toContain('acknowledge:apple:casa:e2e-aula:2026-09-21T11:00:00:2026-09-21T12:00:00');
});

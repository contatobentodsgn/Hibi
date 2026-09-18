import { test, expect, type Page } from '@playwright/test';

// O fuso fixo torna a conversão do UTC verificável: 11:00Z é 08:00 em São Paulo.
test.use({ timezoneId: 'America/Sao_Paulo' });

const agenda = async (page: Page, tab: 'Semana' | 'Dia') => {
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Agenda', exact: true }).click();
  await page.getByRole('tab', { name: tab }).click();
};
const importIcs = (page: Page, lines: string[]) => page.locator('input[type="file"]').setInputFiles({
  name: 'agenda.ics', mimeType: 'text/calendar', buffer: Buffer.from(['BEGIN:VCALENDAR', 'VERSION:2.0', ...lines, 'END:VCALENDAR'].join('\r\n')),
});
const event = (summary: string, start: string, end: string) => ['BEGIN:VEVENT', `UID:${summary}`, `DTSTART${start}`, `DTEND${end}`, `SUMMARY:${summary}`, 'END:VEVENT'];

// Criar um bloco sobreposto é recusado, mas dados de versões antigas, de outro aparelho ou do
// calendário podem já trazer sobreposição: é isso que a conferência precisa mostrar.
const seedOverlap = async (page: Page, day: string) => {
  await page.evaluate((date) => {
    const data = JSON.parse(window.localStorage.getItem('hibi-study-data') ?? '{}');
    data.blocks = [...(data.blocks ?? []), { id: 'e2e-aula', title: 'Aula', start: `${date}T14:00:00`, end: `${date}T16:00:00`, category: 'learning', isHard: true }, { id: 'e2e-dentista', title: 'Dentista', start: `${date}T15:00:00`, end: `${date}T15:30:00`, category: 'work', isHard: true }, { id: 'e2e-post', title: 'Post', start: `${date}T14:30:00`, end: `${date}T15:30:00`, category: 'work' }];
    window.localStorage.setItem('hibi-study-data', JSON.stringify(data));
  }, day);
  await page.reload();
};

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 8, 7, 10, 0, 0) });
  await page.goto('/');
});

test('o .ics do Google (UTC) entra na hora local, e o evento de dia inteiro é contado em vez de sumir', async ({ page }) => {
  await agenda(page, 'Semana');
  await importIcs(page, [
    ...event('Reunião UTC', ':20260908T110000Z', ':20260908T120000Z'),
    ...event('Feriado', ';VALUE=DATE:20260909', ';VALUE=DATE:20260910'),
  ]);

  await expect(page.getByRole('status').filter({ hasText: 'Eventos importados: 1.' })).toContainText('Ficaram de fora 1 de dia inteiro');
  await expect(page.getByRole('button', { name: 'Delete Reunião UTC at 08:00 on 2026-09-08' })).toBeVisible();
});

test('um bloco fora de 08h–22h aparece na grade da semana', async ({ page }) => {
  await agenda(page, 'Semana');
  await importIcs(page, [...event('Corrida cedo', ':20260908T060000', ':20260908T070000'), ...event('Leitura tarde', ':20260909T230000', ':20260909T233000')]);

  await expect(page.getByRole('button', { name: 'Delete Corrida cedo at 06:00 on 2026-09-08' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete Leitura tarde at 23:00 on 2026-09-09' })).toBeVisible();
});

test('a semana mostra os compromissos que batem, e não as demandas que dividem o horário', async ({ page }) => {
  await agenda(page, 'Semana');
  await expect(page.getByRole('status').filter({ hasText: 'Nenhum compromisso bate com outro nesta semana.' })).toBeVisible();

  await seedOverlap(page, '2026-09-08');
  await agenda(page, 'Semana');

  const aviso = page.getByRole('status').filter({ hasText: 'Compromissos no mesmo horário:' });
  await expect(aviso).toContainText('Aula (08/09 14:00) × Dentista (08/09 15:00)');
  // A demanda que divide o horário com os dois não é conflito.
  await expect(aviso).not.toContainText('Post');
  await expect(page.getByText('Nenhum compromisso bate com outro nesta semana.')).toHaveCount(0);
});

test('no Dia, "Conferir plano" confere de verdade e "24h" mostra a madrugada', async ({ page }) => {
  await seedOverlap(page, '2026-09-07');
  await agenda(page, 'Dia');

  await expect(page.getByText('00:00', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Mostrar as 24 horas' }).click();
  await expect(page.getByText('00:00', { exact: true })).toBeVisible();

  await expect(page.getByText('Compromissos no mesmo horário:')).toHaveCount(0);
  await page.getByRole('button', { name: '✓ Conferir plano' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Compromissos no mesmo horário:' })).toContainText('Aula (07/09 14:00) × Dentista (07/09 15:00)');
});

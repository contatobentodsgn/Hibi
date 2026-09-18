import { readFile } from 'node:fs/promises';
import { test, expect, type Locator, type Page } from '@playwright/test';

const dock = (page: Page) => page.getByRole('navigation', { name: 'Navegação principal' });
const palette = (page: Page) => page.getByRole('dialog', { name: 'Paleta de comandos' });
// Nenhum console.error é aceitável na página de Estatísticas: capturamos desde o goto(). O aviso de
// CSP sobre `frame-ancestors` num <meta> é pré-existente em toda a app (index.html) e dispara em
// qualquer rota a cada carregamento — não é algo que a página de Estatísticas introduz.
const KNOWN_APP_WIDE_WARNING = "The Content Security Policy directive 'frame-ancestors' is ignored when delivered via a <meta> element.";
const captureConsoleErrors = (page: Page): string[] => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error' && message.text() !== KNOWN_APP_WIDE_WARNING) errors.push(message.text()); });
  return errors;
};

test('o menu "Mais seções" do dock abre Estatísticas', async ({ page }) => {
  const errors = captureConsoleErrors(page);
  await page.goto('/');
  await expect(dock(page)).toBeVisible();
  await dock(page).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Estatísticas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Estatísticas', level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a paleta de comandos com /stats abre a mesma página de Estatísticas', async ({ page }) => {
  const errors = captureConsoleErrors(page);
  await page.goto('/');
  await expect(dock(page)).toBeVisible();
  await page.keyboard.press('Meta+K');
  await expect(palette(page)).toBeVisible();
  await palette(page).getByRole('combobox').fill('/stats');
  await page.keyboard.press('Enter');
  await expect(palette(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Estatísticas', level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});

test('/review continua abrindo a Revisão, não Estatísticas', async ({ page }) => {
  await page.goto('/');
  await expect(dock(page)).toBeVisible();
  await page.keyboard.press('Meta+K');
  await expect(palette(page)).toBeVisible();
  await palette(page).getByRole('combobox').fill('/review');
  await page.keyboard.press('Enter');
  await expect(palette(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Review', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Estatísticas', level: 1 })).toHaveCount(0);
});

test('o dock reflete Estatísticas como seção atual, como faz para as demais seções de "Mais"', async ({ page }) => {
  await page.goto('/');
  await expect(dock(page)).toBeVisible();
  await dock(page).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Estatísticas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Estatísticas', level: 1 })).toBeVisible();
  // O gatilho "···" mostra data-active quando a seção atual não está entre os itens fixos do dock —
  // o mesmo comportamento já coberto para as demais seções de "Mais" (ex.: Ajustes, Revisão).
  await expect(dock(page).getByRole('button', { name: 'Mais seções' })).toHaveAttribute('data-active', 'true');
  await dock(page).getByRole('button', { name: 'Mais seções' }).click();
  await expect(page.getByRole('menuitem', { name: 'Estatísticas', exact: true })).toHaveAttribute('aria-current', 'page');
});

// "Hoje" nas Estatísticas é a data local real, porque cada atividade é gravada com o relógio do navegador.
// Fixar o relógio em hora local (Node e Chromium herdam o mesmo TZ) deixa o fluxo independente da data real
// e do fuso do CI. Estes cenários usam 07/09/2026, a data de referência do seed (o primeiro dia com blocos).
const workspaceToday = () => new Date(2026, 8, 7, 10, 0, 0);
const TASK = 'Kabrito Post 01';
const CSV_HEADER = 'at,type,entityType,entityId,title,durationMinutes,category,folder,value';
const UTF8_BOM = '\uFEFF';

const openStats = async (page: Page) => {
  await dock(page).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Estatísticas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Estatísticas', level: 1 })).toBeVisible();
};
const periodGroup = (page: Page) => page.getByRole('group', { name: 'Período', exact: true });
const periodButton = (page: Page, name: string) => periodGroup(page).getByRole('button', { name, exact: true });
const choosePeriod = async (page: Page, name: string) => {
  await periodButton(page, name).click();
  await expect(periodButton(page, name)).toHaveAttribute('aria-pressed', 'true');
};
const chooseCustomPeriod = async (page: Page, start: string, end: string) => {
  await choosePeriod(page, 'Personalizado');
  await page.getByLabel('Início', { exact: true }).fill(start);
  await page.getByLabel('Fim', { exact: true }).fill(end);
};
// Os cartões não têm papel próprio: o valor é o parágrafo `.stats-card-value` do item com o rótulo.
const summaryCard = (page: Page, label: string) =>
  page.getByRole('region', { name: 'Resumo', exact: true }).getByRole('listitem').filter({ has: page.getByText(label, { exact: true }) });
const cardValue = (page: Page, label: string) => summaryCard(page, label).locator('.stats-card-value');
const historyItems = (page: Page) => page.getByRole('region', { name: 'Histórico', exact: true }).getByRole('listitem');
const dailyTable = (page: Page) => page.getByRole('table', { name: /^Valores por dia, / });
// Em "Hoje" a tabela tem o cabeçalho e um único dia; as células são: tarefas, foco, planejado, concluído.
const todayCells = (page: Page) => dailyTable(page).getByRole('row').nth(1).getByRole('cell');

const completeTask = async (page: Page, title: string) => {
  await expect(dock(page)).toBeVisible();
  await dock(page).getByRole('button', { name: 'Tarefas', exact: true }).click();
  await page.getByRole('button', { name: `Complete ${title}`, exact: true }).click();
  await expect(page.getByRole('button', { name: `Complete ${title}`, exact: true })).toHaveCount(0);
};

const expectCompletedTaskToday = async (page: Page) => {
  await expect(cardValue(page, 'Tarefas concluídas')).toHaveText('1');
  await expect(historyItems(page)).toHaveCount(1);
  await expect(historyItems(page).first()).toContainText('Tarefa concluída');
  await expect(historyItems(page).first()).toContainText(`${TASK} · 1 h`);
  await expect(dailyTable(page).getByRole('row')).toHaveCount(2);
  await expect(todayCells(page)).toHaveText(['1', '0', '0', '60']);
};

const exportCsv = async (page: Page) => {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar CSV', exact: true }).click()]);
  return { fileName: download.suggestedFilename(), content: await readFile(await download.path(), 'utf8') };
};

async function tabUntilFocused(page: Page, target: Locator, maxTabs = 60) {
  for (let presses = 0; presses < maxTabs; presses += 1) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error(`O alvo não recebeu foco depois de ${maxTabs} Tabs.`);
}

test('uma tarefa concluída em Tarefas aparece em Hoje, persiste ao recarregar e some de um período que exclui hoje', async ({ page }) => {
  const errors = captureConsoleErrors(page);
  await page.clock.install({ time: workspaceToday() });
  await page.goto('/');
  await completeTask(page, TASK);

  await openStats(page);
  await choosePeriod(page, 'Hoje');
  await expectCompletedTaskToday(page);

  await page.reload();
  await expect(dock(page)).toBeVisible();
  await openStats(page);
  await choosePeriod(page, 'Hoje');
  await expectCompletedTaskToday(page);

  await chooseCustomPeriod(page, '2026-09-01', '2026-09-06');
  await expect(cardValue(page, 'Tarefas concluídas')).toHaveText('0');
  await expect(page.getByRole('heading', { name: 'Nenhuma atividade registrada neste período.', exact: true })).toBeVisible();
  await expect(historyItems(page)).toHaveCount(0);
  await expect(page.getByText(TASK)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('o CSV exporta só o período escolhido: Hoje traz a tarefa, um período sem atividade sai só com o cabeçalho', async ({ page }) => {
  const errors = captureConsoleErrors(page);
  await page.clock.install({ time: workspaceToday() });
  await page.goto('/');
  await completeTask(page, TASK);
  await openStats(page);

  await choosePeriod(page, 'Hoje');
  const today = await exportCsv(page);
  expect(today.fileName).toBe('hibi-stats-2026-09-07.csv');
  await expect(page.getByText('Exportado hibi-stats-2026-09-07.csv.', { exact: true })).toBeVisible();
  expect(today.content.startsWith(UTF8_BOM)).toBe(true);
  const lines = today.content.slice(UTF8_BOM.length).split('\r\n');
  expect(lines).toHaveLength(3);
  expect(lines[0]).toBe(CSV_HEADER);
  expect(lines[1]).toMatch(/^[^,]+,task\.completed,task,kabrito-1,Kabrito Post 01,60,work,Bento,$/);
  expect(lines[2]).toBe('');
  // O instante gravado cai no dia local fixado, seja qual for o fuso.
  const at = new Date(lines[1].split(',')[0]);
  expect([at.getFullYear(), at.getMonth(), at.getDate()]).toEqual([2026, 8, 7]);

  await chooseCustomPeriod(page, '2026-09-01', '2026-09-06');
  await expect(cardValue(page, 'Tarefas concluídas')).toHaveText('0');
  const excluded = await exportCsv(page);
  expect(excluded.fileName).toBe('hibi-stats-2026-09-07.csv');
  expect(excluded.content).not.toContain(TASK);
  expect(excluded.content).toBe(`${UTF8_BOM}${CSV_HEADER}\r\n`);
  expect(errors).toEqual([]);
});

// Um dia que não é a data de referência do seed (07/09/2026) e cai em outra semana (segunda 14 a domingo 20/09).
const realToday = () => new Date(2026, 8, 16, 10, 0, 0);
const headingRange = (page: Page) => page.locator('.stats-view .view-heading p.muted');
// O rótulo é montado no próprio navegador com o formato da página (datas de calendário em UTC), sem depender do ICU do Node.
const rangeLabel = (page: Page, start: string, end: string) =>
  page.evaluate(([from, to]) => new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .formatRange(new Date(`${from}T00:00:00Z`), new Date(`${to}T00:00:00Z`)), [start, end]);

test('Hoje e a semana partem da data local real, não da data de referência do workspace', async ({ page }) => {
  const errors = captureConsoleErrors(page);
  await page.clock.install({ time: realToday() });
  await page.goto('/');
  await completeTask(page, TASK);
  await openStats(page);

  // Período inicial: a semana real de 16/09, com a tarefa recém-concluída.
  await expect(periodButton(page, 'Semana')).toHaveAttribute('aria-pressed', 'true');
  await expect(headingRange(page)).toHaveText(await rangeLabel(page, '2026-09-14', '2026-09-20'));
  await expect(dailyTable(page).getByRole('row')).toHaveCount(8);
  await expect(cardValue(page, 'Tarefas concluídas')).toHaveText('1');
  await choosePeriod(page, 'Personalizado');
  await expect(page.getByLabel('Início', { exact: true })).toHaveValue('2026-09-14');
  await expect(page.getByLabel('Fim', { exact: true })).toHaveValue('2026-09-20');

  await choosePeriod(page, 'Hoje');
  await expect(headingRange(page)).toHaveText(await rangeLabel(page, '2026-09-16', '2026-09-16'));
  await expectCompletedTaskToday(page);
  expect(errors).toEqual([]);
});

test('os botões de período e a tabela diária são alcançáveis e operáveis pelo teclado', async ({ page }) => {
  await page.clock.install({ time: workspaceToday() });
  await page.goto('/');
  await completeTask(page, TASK);
  await openStats(page);
  // A semana é o período inicial: sete dias mais o cabeçalho.
  await expect(periodButton(page, 'Semana')).toHaveAttribute('aria-pressed', 'true');
  await expect(dailyTable(page).getByRole('row')).toHaveCount(8);

  const today = periodButton(page, 'Hoje');
  await tabUntilFocused(page, today);
  await expect(today).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(today).toHaveAttribute('aria-pressed', 'true');
  await expect(today).toBeFocused();
  await expect(dailyTable(page).getByRole('row')).toHaveCount(2);

  // Ordem de tabulação: os quatro períodos em sequência e, logo depois, a região rolável da tabela.
  for (const name of ['Semana', 'Mês', 'Personalizado']) {
    await page.keyboard.press('Tab');
    await expect(periodButton(page, name)).toBeFocused();
  }
  await page.keyboard.press('Tab');
  const tableRegion = page.getByRole('region', { name: /^Valores por dia, / });
  await expect(tableRegion).toBeFocused();
  await expect(tableRegion.getByRole('table')).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  await expect(periodButton(page, 'Personalizado')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(periodButton(page, 'Personalizado')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Início', { exact: true })).toHaveValue('2026-09-07');
  await expect(page.getByLabel('Fim', { exact: true })).toHaveValue('2026-09-07');
});

test('foco concluído e cancelado somam os minutos medidos, só o concluído conta como sessão, e uma pausa não muda nada', async ({ page }) => {
  const errors = captureConsoleErrors(page);
  await page.clock.install({ time: workspaceToday() });
  await page.goto('/');
  await expect(dock(page)).toBeVisible();

  await dock(page).getByRole('button', { name: 'Foco', exact: true }).click();
  await page.getByRole('button', { name: 'Start focus' }).click();
  await page.clock.runFor(25 * 60 * 1000 + 1000);
  await expect(page.getByRole('button', { name: 'Start focus' })).toBeVisible();

  await page.getByRole('button', { name: 'Start focus' }).click();
  await expect(page.getByRole('button', { name: 'Pause session' })).toBeVisible();
  await page.clock.runFor(7 * 60 * 1000);
  // Pausada e trocada pelo descanso, a sessão é abandonada: vira focus.cancelled com os 7 minutos medidos.
  await page.getByRole('button', { name: 'Pause session' }).click();
  await page.getByRole('button', { name: 'Fazer uma pausa' }).click();
  await expect(page.getByRole('button', { name: 'Começar pausa' })).toBeVisible();
  await openStats(page);

  // focusMinutes = concluído (25) + cancelado (7); focusSessions conta só a concluída.
  const expectFocusTotals = async () => {
    await choosePeriod(page, 'Hoje');
    await expect(cardValue(page, 'Tempo de foco')).toHaveText('32 min');
    await expect(summaryCard(page, 'Tempo de foco').getByText('Sessões concluídas: 1', { exact: true })).toBeVisible();
    await expect(cardValue(page, 'Tarefas concluídas')).toHaveText('0');
    await expect(todayCells(page)).toHaveText(['0', '32', '0', '0']);
    await expect(historyItems(page)).toHaveCount(5);
    await expect(historyItems(page).filter({ hasText: 'Foco iniciado' })).toHaveCount(2);
    await expect(historyItems(page).filter({ hasText: 'Foco pausado' })).toHaveCount(1);
    await expect(historyItems(page).filter({ hasText: 'Sessão de foco concluída' })).toHaveCount(1);
    await expect(historyItems(page).filter({ hasText: 'Sessão de foco concluída' })).toContainText('25 min');
    await expect(historyItems(page).filter({ hasText: 'Sessão de foco cancelada' })).toHaveCount(1);
    await expect(historyItems(page).filter({ hasText: 'Sessão de foco cancelada' })).toContainText('7 min');
  };
  await expectFocusTotals();

  await dock(page).getByRole('button', { name: 'Foco', exact: true }).click();
  await page.getByRole('button', { name: 'Fazer uma pausa' }).click();
  await page.getByRole('button', { name: 'Começar pausa' }).click();
  await expect(page.getByRole('button', { name: 'Encerrar pausa' })).toBeVisible();
  await page.clock.runFor(5 * 60 * 1000 + 1000);
  await expect(page.getByRole('button', { name: 'Começar pausa' })).toBeVisible();

  await openStats(page);
  await expectFocusTotals();
  expect(errors).toEqual([]);
});

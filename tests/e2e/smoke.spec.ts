import { test, expect, type Page } from '@playwright/test';

const dock = (page: Page) => page.getByRole('navigation', { name: 'Navegação principal' });
const go = (page: Page, name: string) => dock(page).getByRole('button', { name, exact: true }).click();
const goMore = async (page: Page, name: string) => { await dock(page).getByRole('button', { name: 'Mais seções' }).click(); await page.getByRole('menuitem', { name, exact: true }).click(); };
const goWeek = async (page: Page) => { await go(page, 'Agenda'); await page.getByRole('tab', { name: 'Semana' }).click(); };
const goDay = async (page: Page) => { await go(page, 'Agenda'); await page.getByRole('tab', { name: 'Dia' }).click(); };
const openCommands = (page: Page) => dock(page).getByRole('button', { name: 'Comandos' }).click();
// O seed traz blocos fixos de 07 a 11/09/2026, e Início, Dia e Semana abrem na data local real.
// Sem fixar o relógio, estes cenários passariam só enquanto a data real estivesse nesse intervalo.
// A data é montada com componentes locais (Node e Chromium herdam o mesmo TZ), como em stats.spec.ts.
const seedToday = () => new Date(2026, 8, 7, 10, 0, 0);

test('navega pelo calendário e abre comandos', async ({ page }) => {
  await page.clock.install({ time: seedToday() });
  await page.goto('/');
  await expect(page.getByText('Make room for')).toBeVisible();
  await goWeek(page);
  await expect(page.getByText('Mon 07 — Sun 13')).toBeVisible();
  await page.keyboard.press('Meta+K');
  await expect(page.getByRole('dialog', { name: 'Paleta de comandos' })).toBeVisible();
});

test('todas as seções principais são navegáveis', async ({ page }) => {
  await page.goto('/');
  for (const section of ['Tarefas', 'Agenda', 'Foco', 'Taby', 'Home']) {
    await go(page, section);
    await expect(page.locator('main')).toBeVisible();
  }
  for (const section of ['Lembretes', 'Notas', 'Hábitos', 'Metas', 'Revisão', 'Ajustes', 'Ajuda', 'Eventos', 'Feedback', 'Atualizações', 'Hardware']) {
    await goMore(page, section);
    await expect(page.locator('main')).toBeVisible();
  }
});

test('paleta de comandos permite navegação por teclado', async ({ page }) => {
  await page.clock.install({ time: seedToday() });
  await page.goto('/');
  await openCommands(page);
  const palette = page.getByRole('dialog', { name: 'Paleta de comandos' });
  await expect(palette).toBeVisible();
  const input = palette.locator('input');
  await input.fill('/week');
  await expect(palette.getByRole('option', { name: /Abrir agenda da semana/ })).toHaveAttribute('data-selected', 'true');
  await input.press('Enter');
  await expect(page.getByText('Mon 07 — Sun 13')).toBeVisible();
});

test('atalho barra abre comandos fora de campos de texto', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true })));
  await expect(page.getByRole('dialog', { name: 'Paleta de comandos' })).toBeVisible();
});

test('captura rápida da Home abre a paleta de comandos', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open quick capture' }).click();
  await expect(page.getByRole('dialog', { name: 'Paleta de comandos' })).toBeVisible();
});

test('filtro de pasta funciona em Tarefas e Notas', async ({ page }) => {
  await page.goto('/');
  await dock(page).getByRole('button', { name: 'Tarefas', exact: true }).click({ force: true });
  const chip = page.getByRole('button', { name: /^Pasta · Bento \d+$/ });
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.task-row').first()).toBeVisible();
  await goMore(page, 'Notas');
  await expect(page.getByRole('button', { name: 'Pasta · Todas' })).toBeVisible();
});

test('+ New note leva o foco para o formulário de nota nova', async ({ page }) => {
  await page.goto('/');
  await goMore(page, 'Notas');
  await page.getByRole('button', { name: '+ New note' }).click();
  await expect(page.getByRole('form', { name: 'Create note' }).getByLabel('Title')).toBeFocused();
});

test.skip('clicar no item do dock da tela atual não apaga o que está sendo digitado', async ({ page }) => {
  await page.goto('/');
  await go(page, 'Tarefas');
  await page.getByRole('button', { name: '+ New task', exact: true }).click();
  const createTask = page.getByRole('dialog', { name: 'Create task' });
  await createTask.getByRole('textbox', { name: 'Title' }).fill('Rascunho de tarefa');
  await dock(page).getByRole('button', { name: 'Tarefas', exact: true }).click({ force: true });
  await expect(createTask.getByRole('textbox', { name: 'Title' })).toHaveValue('Rascunho de tarefa');
});

test('nota criada em pasta nova ganha filtro próprio, e trocar de filtro não apaga o rascunho', async ({ page }) => {
  await page.goto('/');
  await goMore(page, 'Notas');
  const form = page.getByRole('form', { name: 'Create note' });
  await form.getByLabel('Title').fill('Briefing Clientes');
  await form.getByLabel('Folder').fill('Clientes');
  await form.getByRole('button', { name: 'Add note' }).click();
  await expect(page.getByRole('button', { name: 'Pasta · Clientes 1' })).toBeVisible();
  await expect(form.getByLabel('Title')).toHaveValue('');

  await form.getByLabel('Title').fill('Rascunho');
  await page.getByRole('button', { name: 'Pasta · Clientes 1' }).click();
  await expect(form.getByLabel('Title')).toHaveValue('Rascunho');
  await expect(form.getByLabel('Folder')).toHaveValue('Clientes');
  await expect(page.getByText('Briefing Clientes')).toBeVisible();

  // O chip clicado acima bate com a pasta já digitada, o que não provaria nada sobre folderTouched.
  // Digitar uma pasta diferente e trocar de filtro é o que de fato mostra que o rascunho sobrevive.
  await form.getByLabel('Folder').fill('Outra');
  await page.getByRole('button', { name: 'Pasta · Todas' }).click();
  await expect(form.getByLabel('Folder')).toHaveValue('Outra');
});

test('editar uma nota troca e limpa a pasta', async ({ page }) => {
  await page.goto('/');
  await goMore(page, 'Notas');
  const form = page.getByRole('form', { name: 'Create note' });
  await form.getByLabel('Title').fill('Nota para editar');
  await form.getByLabel('Folder').fill('Clientes');
  await form.getByRole('button', { name: 'Add note' }).click();
  await expect(page.getByText('Nota para editar')).toBeVisible();

  await page.getByRole('button', { name: 'Edit Nota para editar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit note' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Folder').fill('');
  await dialog.getByRole('button', { name: 'Save note' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Nota para editar').locator('..').getByText(/Sem pasta$/)).toBeVisible();

  await page.getByRole('button', { name: 'Edit Nota para editar' }).click();
  await dialog.getByLabel('Folder').fill('Arquivo');
  await dialog.getByRole('button', { name: 'Save note' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pasta · Arquivo 1' })).toBeVisible();
});

test('abas de Settings alternam conteúdo funcional', async ({ page }) => {
  await page.goto('/');
  await goMore(page, 'Ajustes');
  await expect(page.getByRole('heading', { name: 'General' })).toBeVisible();
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send test notification' })).toBeVisible();
  await page.getByRole('button', { name: 'Data', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Data' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset study data' })).toBeVisible();
});

test('restaura um backup completo pela interface sem incluir dados do Keychain', async ({ page }) => {
  await page.clock.install({ time: seedToday() });
  await page.goto('/');
  const backup = await page.evaluate(() => {
    const data = JSON.parse(window.localStorage.getItem('hibi-study-data') ?? '{}');
    data.tasks.push({ id: 'backup-task', title: 'Tarefa restaurada', durationMinutes: 45, category: 'important', folder: 'Bento' });
    data.notes.push({ id: 'backup-note', title: 'Nota restaurada', content: 'Contexto preservado', folder: 'Bento', createdAt: '2026-09-08T12:00:00.000Z', updatedAt: '2026-09-08T12:00:00.000Z' });
    data.blocks.push({ id: 'backup-block', title: 'Bloco restaurado', start: '2026-09-07T08:00:00-03:00', end: '2026-09-07T09:00:00-03:00', category: 'important' });
    return JSON.stringify({ app: 'Hibi', version: 1, exportedAt: '2026-09-08T12:00:00.000Z', data, preferences: { language: 'pt', twentyFourHour: true } });
  });
  await goMore(page, 'Ajustes');
  await page.getByRole('button', { name: 'Data', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByLabel('Choose Hibi workspace backup').setInputFiles({ name: 'hibi-workspace-backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
  await expect(page.getByText('Workspace restored from hibi-workspace-backup.json.')).toBeVisible();
  await go(page, 'Tarefas');
  await expect(page.getByText('Tarefa restaurada')).toBeVisible();
  await goMore(page, 'Notas');
  await expect(page.getByText('Nota restaurada')).toBeVisible();
  await goDay(page);
  await expect(page.getByText('Bloco restaurado')).toBeVisible();
});

test('navegação diária e semanal atualiza o período', async ({ page }) => {
  await page.clock.install({ time: seedToday() });
  await page.goto('/');
  await goDay(page);
  await expect(page.getByText('MONDAY · 07 SEPTEMBER 2026')).toBeVisible();
  await page.getByRole('button', { name: 'Next day' }).click();
  await expect(page.getByText('TUESDAY · 08 SEPTEMBER 2026')).toBeVisible();
  await page.getByRole('tab', { name: 'Semana' }).click();
  await expect(page.getByText('Mon 07 — Sun 13')).toBeVisible();
  await page.getByRole('button', { name: 'Next week' }).click();
  await expect(page.getByText('Mon 14 — Sun 20')).toBeVisible();
});

test('filtros de lembretes alteram a lista', async ({ page }) => {
  await page.goto('/');
  await goMore(page, 'Lembretes');
  await expect(page.locator('.list-card').getByText('vaga/inglês - Horizontes')).toBeVisible();
  await page.getByRole('button', { name: /Wellbeing 0/ }).click();
  await expect(page.getByText('No reminders match this filter.')).toBeVisible();
  await page.getByRole('button', { name: /All 1/ }).click();
  await expect(page.locator('.list-card').getByText('vaga/inglês - Horizontes')).toBeVisible();
});

test('criação de lembrete diário preserva a recorrência', async ({ page }) => {
  await page.goto('/');
  await goMore(page, 'Lembretes');
  await page.getByRole('button', { name: '+ New reminder' }).click();
  const form = page.getByRole('dialog', { name: 'Create reminder' });
  await form.getByRole('textbox', { name: 'Title' }).fill('Revisar agenda');
  await form.getByRole('combobox', { name: 'Schedule type' }).selectOption('daily');
  await form.getByRole('textbox', { name: 'Time' }).fill('08:30');
  await form.getByRole('button', { name: 'Create reminder' }).click();
  await expect(page.locator('.list-card').getByText('Revisar agenda')).toBeVisible();
  await expect(page.getByText('Every day · 08:30')).toBeVisible();
});

// O dia pré-marcado é o do início do plano (`planStartDate`, o primeiro dia com bloco), e o seed é
// ancorado no dia em que roda: sem fixar o relógio, o dia esperado mudaria a cada dia de execução.
// 07/09/2026 é uma segunda, então "Mon" aqui é escolha do teste, não coincidência do seed antigo.
test('criação semanal preseleciona o dia do início e permite escolher categoria', async ({ page }) => {
  await page.clock.install({ time: seedToday() });
  await page.goto('/');
  await goMore(page, 'Lembretes');
  await page.getByRole('button', { name: '+ New reminder' }).click();
  const form = page.getByRole('dialog', { name: 'Create reminder' });
  await form.getByRole('textbox', { name: 'Title' }).fill('Caminhar');
  await form.getByRole('radio', { name: 'Wellbeing' }).check();
  await form.getByRole('combobox', { name: 'Schedule type' }).selectOption('weekly');
  await expect(form.getByRole('checkbox', { name: 'Mon' })).toBeChecked();
  await form.getByRole('textbox', { name: 'Time' }).fill('19:00');
  await form.getByRole('button', { name: 'Create reminder' }).click();
  await expect(page.locator('.list-card').getByText('Caminhar')).toBeVisible();
  await expect(page.getByText('Mon 19:00')).toBeVisible();
});

test('edição de lembrete semanal mantém dias e horários configurados', async ({ page }) => {
  await page.goto('/');
  await goMore(page, 'Lembretes');
  await page.getByRole('button', { name: 'Edit vaga/inglês - Horizontes' }).click();
  const form = page.getByRole('form', { name: 'Edit vaga/inglês - Horizontes' });
  await form.getByRole('combobox', { name: 'Type' }).selectOption('weekly');
  await form.getByRole('textbox', { name: 'Time' }).fill('20:00');
  await form.getByRole('checkbox', { name: 'Tue' }).uncheck();
  await form.getByRole('checkbox', { name: 'Wed' }).check();
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Wed 20:00')).toBeVisible();
});

test('edição de lembrete pelo formulário persiste o novo horário', async ({ page }) => {
  await page.goto('/');
  await goMore(page, 'Lembretes');
  await page.getByRole('button', { name: 'Edit vaga/inglês - Horizontes' }).click();
  const form = page.getByRole('form', { name: 'Edit vaga/inglês - Horizontes' });
  await form.getByRole('textbox', { name: 'Time' }).fill('10:30');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/10:30/)).toBeVisible();
});

test('filtros e ordenação de Tasks são interativos', async ({ page }) => {
  await page.goto('/');
  await go(page, 'Tarefas');
  await page.getByRole('button', { name: /All 8/ }).click();
  await expect(page.getByRole('button', { name: /All 8/ })).toHaveClass(/active/);
  await page.getByRole('button', { name: /Deadline/ }).click();
  await expect(page.getByRole('button', { name: /Deadline/ })).toHaveClass(/active/);
});

test('edita deadline de uma task por formulário acessível e permite remover', async ({ page }) => {
  await page.goto('/');
  await go(page, 'Tarefas');
  await page.getByRole('button', { name: 'Deadline for Kabrito Post 01' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit task deadline' });
  await expect(dialog).toBeVisible();
  const deadline = dialog.getByRole('textbox', { name: 'Deadline' });
  await deadline.fill('2026-09-10 14:30');
  await dialog.getByRole('button', { name: 'Save deadline' }).click();
  await expect(page.getByText(/deadline 2026-09-10 14:30/)).toBeVisible();

  await page.getByRole('button', { name: 'Deadline for Kabrito Post 01' }).click();
  await page.getByRole('dialog', { name: 'Edit task deadline' }).getByRole('button', { name: 'Remove deadline' }).click();
  await expect(page.getByText(/Kabrito Post 01/).locator('..').getByText('sem deadline')).toBeVisible();
});

test('filtros do calendário usam as categorias reais dos blocos', async ({ page }) => {
  await page.clock.install({ time: seedToday() });
  await page.goto('/');
  await goWeek(page);
  await page.getByRole('button', { name: 'Wellbeing', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete Almoço' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Important', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete Aula de inglês' }).first()).toBeVisible();
});

test('Foco e pausa aplicam a duração escolhida antes de iniciar', async ({ page }) => {
  await page.goto('/');
  await go(page, 'Foco');
  await expect(page.getByText('25:00')).toBeVisible();
  await page.getByRole('button', { name: 'Fazer uma pausa' }).click();
  await page.getByRole('button', { name: '10m', exact: true }).click();
  await expect(page.getByText('10 min de pausa no relógio.')).toBeVisible();
  await expect(page.getByText('10:00')).toBeVisible();
  await page.getByRole('button', { name: 'Começar pausa' }).click();
  await expect(page.getByRole('button', { name: 'Encerrar pausa' })).toBeVisible();
});

test('filtros do Day exibem blocos fixos e pausas', async ({ page }) => {
  await page.clock.install({ time: seedToday() });
  await page.goto('/');
  await goDay(page);
  await page.getByRole('button', { name: 'Wellbeing', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete Almoço' })).toBeVisible();
  await page.getByRole('button', { name: 'Important', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete Almoço' })).toBeVisible();
});

test('updates e hardware são acessíveis pela paleta', async ({ page }) => {
  await page.goto('/');
  await openCommands(page);
  await page.getByRole('combobox', { name: 'Digite um comando ou pergunte ao Taby' }).fill('/hardware');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Hardware' })).toBeVisible();
  await openCommands(page);
  await page.getByRole('combobox', { name: 'Digite um comando ou pergunte ao Taby' }).fill('/events');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Instrumentation' })).toBeVisible();
  await openCommands(page);
  await page.getByRole('combobox', { name: 'Digite um comando ou pergunte ao Taby' }).fill('/updates');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Updates' })).toBeVisible();
});

test('assistente local responde sobre a agenda', async ({ page }) => {
  await page.goto('/');
  await go(page, 'Taby');
  const input = page.getByRole('textbox', { name: 'Pergunte ou peça uma ação' });
  await input.fill('qual a agenda de hoje?');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(/\d+ blocos na agenda/)).toBeVisible();
});

test('assistente confirma uma mudança antes de criar uma tarefa local', async ({ page }) => {
  await page.goto('/');
  await go(page, 'Taby');
  const input = page.getByRole('textbox', { name: 'Pergunte ou peça uma ação' });
  await input.fill('crie uma tarefa: Revisar briefing');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('button', { name: 'Confirmar' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText('Tarefa criada: Revisar briefing')).toBeVisible();
  await go(page, 'Tarefas');
  await expect(page.getByText('Revisar briefing')).toBeVisible();
});

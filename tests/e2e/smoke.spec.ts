import { test, expect } from '@playwright/test';

test('navega pelo calendário e abre comandos', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Make room for')).toBeVisible();
  await page.getByRole('button', { name: 'Week' }).click();
  await expect(page.getByText('Mon 07 — Sun 13')).toBeVisible();
  await page.keyboard.press('Meta+K');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
});

test('todas as seções principais são navegáveis', async ({ page }) => {
  await page.goto('/');
  for (const section of ['Tasks', 'Notes', 'Reminders', 'Habits', 'Goals', 'Review', 'Taby', 'Help', 'Day', 'Week', 'Focus', 'Settings', 'Events']) {
    await page.getByRole('button', { name: section, exact: true }).click();
    await expect(page.locator('main')).toBeVisible();
  }
});

test('paleta de comandos permite navegação por teclado', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /commands/ }).click();
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();
  const input = palette.locator('input');
  await input.fill('/week');
  await expect(palette.getByRole('button', { name: /Open weekly schedule/ })).toHaveAttribute('data-selected', 'true');
  await input.press('Enter');
  await expect(page.getByText('Mon 07 — Sun 13')).toBeVisible();
});

test('atalho barra abre comandos fora de campos de texto', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true })));
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
});

test('captura rápida da Home abre a paleta de comandos', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open quick capture' }).click();
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
});

test('filtro Bento funciona em Tasks e Notes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await page.getByRole('button', { name: 'Folder · Bento' }).click();
  await expect(page.getByText('Kabrito Post 01')).toBeVisible();
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await page.getByRole('button', { name: 'Folder · Bento' }).click();
  await expect(page.locator('main')).toBeVisible();
});

test('abas de Settings alternam conteúdo funcional', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'General' })).toBeVisible();
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send test notification' })).toBeVisible();
  await page.getByRole('button', { name: 'Data', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Data' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset study data' })).toBeVisible();
});

test('navegação diária e semanal atualiza o período', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Day', exact: true }).click();
  await expect(page.getByText('MONDAY · 07 SEPTEMBER 2026')).toBeVisible();
  await page.getByRole('button', { name: 'Next day' }).click();
  await expect(page.getByText('TUESDAY · 08 SEPTEMBER 2026')).toBeVisible();
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await expect(page.getByText('Mon 07 — Sun 13')).toBeVisible();
  await page.getByRole('button', { name: 'Next week' }).click();
  await expect(page.getByText('Mon 14 — Sun 20')).toBeVisible();
});

test('filtros de lembretes alteram a lista', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Reminders', exact: true }).click();
  await expect(page.getByText('vaga/inglês - Horizontes')).toBeVisible();
  await page.getByRole('button', { name: /Wellbeing 0/ }).click();
  await expect(page.getByText('No reminders match this filter.')).toBeVisible();
  await page.getByRole('button', { name: /All 1/ }).click();
  await expect(page.getByText('vaga/inglês - Horizontes')).toBeVisible();
});

test('criação de lembrete diário preserva a recorrência', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Reminders', exact: true }).click();
  await page.getByRole('button', { name: '+ New reminder' }).click();
  const form = page.getByRole('dialog', { name: 'Create reminder' });
  await form.getByRole('textbox', { name: 'Title' }).fill('Revisar agenda');
  await form.getByRole('combobox', { name: 'Schedule type' }).selectOption('daily');
  await form.getByRole('textbox', { name: 'Time' }).fill('08:30');
  await form.getByRole('button', { name: 'Create reminder' }).click();
  await expect(page.getByText('Revisar agenda')).toBeVisible();
  await expect(page.getByText('Every day · 08:30')).toBeVisible();
});

test('criação semanal preseleciona o dia do início e permite escolher categoria', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Reminders', exact: true }).click();
  await page.getByRole('button', { name: '+ New reminder' }).click();
  const form = page.getByRole('dialog', { name: 'Create reminder' });
  await form.getByRole('textbox', { name: 'Title' }).fill('Caminhar');
  await form.getByRole('radio', { name: 'Wellbeing' }).check();
  await form.getByRole('combobox', { name: 'Schedule type' }).selectOption('weekly');
  await expect(form.getByRole('checkbox', { name: 'Mon' })).toBeChecked();
  await form.getByRole('textbox', { name: 'Time' }).fill('19:00');
  await form.getByRole('button', { name: 'Create reminder' }).click();
  await expect(page.getByText('Caminhar')).toBeVisible();
  await expect(page.getByText('Mon 19:00')).toBeVisible();
});

test('edição de lembrete semanal mantém dias e horários configurados', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Reminders', exact: true }).click();
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
  await page.getByRole('button', { name: 'Reminders', exact: true }).click();
  await page.getByRole('button', { name: 'Edit vaga/inglês - Horizontes' }).click();
  const form = page.getByRole('form', { name: 'Edit vaga/inglês - Horizontes' });
  await form.getByRole('textbox', { name: 'Time' }).fill('10:30');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/10:30/)).toBeVisible();
});

test('filtros e ordenação de Tasks são interativos', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await page.getByRole('button', { name: /All 8/ }).click();
  await expect(page.getByRole('button', { name: /All 8/ })).toHaveClass(/active/);
  await page.getByRole('button', { name: /Deadline/ }).click();
  await expect(page.getByRole('button', { name: /Deadline/ })).toHaveClass(/active/);
});

test('filtros do calendário usam as categorias reais dos blocos', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await page.getByRole('button', { name: 'Wellbeing', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete Almoço' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Important', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete Aula de inglês' }).first()).toBeVisible();
});

test('Focus aplica a duração escolhida antes de iniciar', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Focus', exact: true }).click();
  await page.getByRole('button', { name: '5m break', exact: true }).click();
  await expect(page.getByText('Pick a task — 5m on the clock.')).toBeVisible();
  await expect(page.getByText('05:00')).toBeVisible();
  await page.getByRole('button', { name: 'Start focus' }).click();
  await expect(page.getByRole('button', { name: 'Pause session' })).toBeVisible();
});

test('filtros do Day exibem blocos fixos e pausas', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Day', exact: true }).click();
  await page.getByRole('button', { name: 'Wellbeing', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete Almoço' })).toBeVisible();
  await page.getByRole('button', { name: 'Important', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete Almoço' })).toBeVisible();
});

test('updates e hardware são acessíveis pela paleta', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /commands/ }).click();
  await page.getByRole('textbox', { name: 'Type a command' }).fill('/hardware');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Hardware' })).toBeVisible();
  await page.getByRole('button', { name: 'Open Events' }).click();
  await expect(page.getByRole('heading', { name: 'Instrumentation' })).toBeVisible();
  await page.getByRole('button', { name: /commands/ }).click();
  await page.getByRole('textbox', { name: 'Type a command' }).fill('/updates');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Updates' })).toBeVisible();
});

test('assistente local responde sobre a agenda', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Taby', exact: true }).click();
  const input = page.getByPlaceholder('Ask about your workspace');
  await input.fill('qual a agenda de hoje?');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(/Hoje há 10 blocos/)).toBeVisible();
  await input.fill('qual o próximo compromisso?');
  await input.press('Enter');
  await expect(page.getByText(/Seu próximo bloco é/)).toBeVisible();
});

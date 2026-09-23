import { test, expect, type Page } from '@playwright/test';

const dock = (page: Page) => page.getByRole('navigation', { name: 'Navegação principal' });
const palette = (page: Page) => page.getByRole('dialog', { name: 'Paleta de comandos' });
const list = (page: Page) => page.getByRole('region', { name: 'Conversas' });
// A montagem inicial do React precisa terminar antes de qualquer atalho ou clique; mesma cautela
// que `foundation.spec.ts` já toma. As asserções são sobre a mensagem do usuário, gravada antes de
// o modelo responder: esperar a resposta amarraria o teste à latência do provedor local.
const openAssistant = async (page: Page) => {
  await expect(dock(page)).toBeVisible();
  await dock(page).getByRole('button', { name: 'Assistente', exact: true }).click();
};

test('uma conversa do Taby sobrevive ao recarregar e pode ser apagada', async ({ page }) => {
  await page.goto('/');
  await openAssistant(page);
  await page.getByRole('textbox', { name: 'Pergunte ou peça uma ação' }).fill('quais tarefas vencem hoje?');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(list(page)).toContainText('quais tarefas vencem hoje?');
  const status = page.getByRole('region', { name: 'Status da conversa do assistente', exact: true });
  await expect(status).toContainText('Mensagens nesta conversa');
  await expect(status).toContainText('Resposta pronta');

  await page.reload();
  await openAssistant(page);
  await expect(list(page)).toContainText('quais tarefas vencem hoje?');

  await page.keyboard.press('Meta+K');
  await expect(palette(page)).toBeVisible();
  await palette(page).getByRole('combobox').fill('e amanhã?');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(list(page)).toContainText('quais tarefas vencem hoje?');

  page.once('dialog', (dialog) => void dialog.accept());
  await list(page).getByRole('button', { name: 'Apagar todas', exact: true }).click();
  await expect(page.getByText('Nenhuma conversa salva ainda.')).toBeVisible();
});

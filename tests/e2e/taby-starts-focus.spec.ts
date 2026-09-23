import { test, expect, type Page } from '@playwright/test';

const pedirAoAssistente = async (page: Page, frase: string) => {
  await page.getByRole('button', { name: 'Assistente', exact: true }).click();
  await page.getByRole('textbox', { name: 'Pergunte ou peça uma ação' }).fill(frase);
  await page.getByRole('button', { name: 'Enviar' }).click();
  await page.getByRole('alert').getByRole('button', { name: 'Confirmar' }).click();
};

// Antes, o pedido só abria a tela de Foco e o notch anunciava "Sessão de foco iniciada": o relógio
// ficava parado, os lembretes não eram segurados e nada entrava nas estatísticas.
test('"iniciar foco" pelo Taby começa uma sessão de verdade', async ({ page }) => {
  await page.goto('/');
  await pedirAoAssistente(page, 'iniciar foco');

  await expect(page.getByRole('button', { name: 'Pausar sessão' })).toBeVisible();
  // O relógio anda: a sessão de 25 minutos já passou do primeiro segundo.
  await expect(page.getByText(/^24:5\d$/).first()).toBeVisible({ timeout: 5_000 });

  // Um início só, sem um cancelamento fantasma: começar no meio do mount duplo do React registraria
  // uma sessão "cancelada" com zero minutos nas estatísticas.
  const atividades = await page.evaluate(() => {
    const salvo = JSON.parse(window.localStorage.getItem('hibi-study-data') ?? '{}') as { activity?: { type: string }[] };
    return (salvo.activity ?? []).map((item) => item.type).filter((type) => type.startsWith('focus.'));
  });
  expect(atividades).toEqual(['focus.started']);
});

test('abrir a tela de Foco depois, sem pedido, não inicia nada sozinho', async ({ page }) => {
  await page.goto('/');
  await pedirAoAssistente(page, 'iniciar foco');
  await expect(page.getByRole('button', { name: 'Pausar sessão' })).toBeVisible();
  await page.getByRole('button', { name: 'Pausar sessão' }).click();

  await page.getByRole('button', { name: 'Tarefas', exact: true }).click();
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Foco', exact: true }).click();

  // O pedido já foi atendido: voltar à tela não pode reiniciar a sessão. A espera dá tempo a um
  // início automático aparecer, se ele fosse acontecer.
  await page.waitForTimeout(600);
  await expect(page.getByRole('button', { name: 'Começar foco' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pausar sessão' })).toHaveCount(0);
});

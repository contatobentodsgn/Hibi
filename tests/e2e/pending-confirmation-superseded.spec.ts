import { test, expect, type Page } from '@playwright/test';

type Registro = { mostrados: { requestId: string; kind: string }[]; escondidos: string[] };

/** O notch vive no processo principal; o dublê só guarda o que o renderer pediu para mostrar e esconder. */
async function instalarNotch(page: Page) {
  await page.addInitScript(() => {
    const registro = { mostrados: [] as { requestId: string; kind: string }[], escondidos: [] as string[] };
    (window as unknown as { pixanoE2E: unknown }).pixanoE2E = registro;
    (window as unknown as { pixanoDesktop: unknown }).pixanoDesktop = {
      showNotch: async (presentation: { requestId: string; kind: string }) => { registro.mostrados.push({ requestId: presentation.requestId, kind: presentation.kind }); return { requestId: presentation.requestId }; },
      hideNotch: async (requestId: string) => { registro.escondidos.push(requestId); return true; },
    };
  });
}

const registro = (page: Page) => page.evaluate(() => (window as unknown as { pixanoE2E: Registro }).pixanoE2E);

// Antes, o cartão da confirmação antiga ficava no notch e um clique nele era jogado fora em silêncio:
// a pessoa achava que tinha confirmado.
test('perguntar de novo com uma confirmação pendente tira o cartão dela do notch', async ({ page }) => {
  await instalarNotch(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Assistente', exact: true }).click();
  const campo = page.getByRole('textbox', { name: 'Pergunte ou peça uma ação' });

  await campo.fill('crie uma tarefa: revisar roteiro');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByRole('alert').getByRole('button', { name: 'Confirmar' })).toBeVisible();
  const confirmacao = (await registro(page)).mostrados.find((item) => item.kind === 'confirmation');
  expect(confirmacao).toBeDefined();

  await campo.fill('qual a minha agenda hoje?');
  await page.getByRole('button', { name: 'Enviar' }).click();

  await expect(page.getByRole('alert').getByRole('button', { name: 'Confirmar' })).toHaveCount(0);
  await expect.poll(async () => (await registro(page)).escondidos).toContain(confirmacao!.requestId);
});

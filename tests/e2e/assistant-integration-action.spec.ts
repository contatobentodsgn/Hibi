import { test, expect, type Page } from '@playwright/test';

// Ponte mínima do app desktop: só o par preparar/executar e o notch, para que o
// provedor de IA continue caindo no runtime local determinístico.
async function installActionBridge(page: Page, { ok = true }: { ok?: boolean } = {}) {
  await page.addInitScript((accepted) => {
    const calls: string[] = [];
    const notch: unknown[] = [];
    let companionAction: ((action: { requestId: string; actionId: 'confirm' | 'cancel' }) => void) | null = null;
    (window as unknown as { hibiE2E: unknown }).hibiE2E = {
      calls, notch,
      companionConfirm: (requestId: string) => companionAction?.({ requestId, actionId: 'confirm' }),
    };
    (window as unknown as { hibiDesktop: Record<string, unknown> }).hibiDesktop = {
      info: async () => ({ name: 'Hibi', version: '0.1.0', localOnly: true }),
      prepareIntegrationAction: async (input: { connectorId: string; kind: string; payload: Record<string, unknown> }) => {
        calls.push(`prepare:${input.connectorId}:${input.kind}:${JSON.stringify(input.payload)}`);
        return { id: 'action-1', connectorId: input.connectorId, kind: input.kind, confirmationId: 'confirm-1', requiresConfirmation: true };
      },
      executeApprovedIntegrationAction: async (input: { actionId: string; confirmationId: string }) => {
        calls.push(`execute:${input.actionId}:${input.confirmationId}`);
        return accepted ? { ok: true, remoteId: 'remote-9' } : { ok: false };
      },
      showNotch: async (presentation: unknown) => { notch.push(presentation); return { degraded: false, requestId: (presentation as { requestId: string }).requestId }; },
      hideNotch: async () => true,
      onCompanionAction: (callback: (action: { requestId: string; actionId: 'confirm' | 'cancel' }) => void) => { companionAction = callback; return () => { companionAction = null; }; },
    };
  }, ok);
}

const bridgeCalls = (page: Page) => page.evaluate(() => (window as unknown as { hibiE2E: { calls: string[] } }).hibiE2E.calls);

async function askForRemoteAction(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Taby', exact: true }).click();
  await page.getByRole('textbox', { name: 'Pergunte ou peça uma ação' }).fill('envie no slack #geral: reunião às 10h');
  await page.getByRole('button', { name: 'Send' }).click();
}

test('uma ação remota só é preparada e executada depois de confirmar no cartão', async ({ page }) => {
  await installActionBridge(page);
  await askForRemoteAction(page);

  await expect(page.getByRole('alert').getByRole('button', { name: 'Confirmar' })).toBeVisible();
  // Nada pode sair antes da confirmação explícita.
  expect(await bridgeCalls(page)).toEqual([]);

  await page.getByRole('alert').getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText('Ação enviada para slack: slack.post')).toBeVisible();
  expect(await bridgeCalls(page)).toEqual(['prepare:slack:slack.post:{"channel":"#geral","text":"reunião às 10h"}', 'execute:action-1:confirm-1']);
});

test('cancelar o cartão não prepara nem executa nada no serviço remoto', async ({ page }) => {
  await installActionBridge(page);
  await askForRemoteAction(page);

  await page.getByRole('alert').getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByText('Ação cancelada.')).toBeVisible();
  expect(await bridgeCalls(page)).toEqual([]);
});

test('a recusa do serviço remoto aparece como falha sem sucesso silencioso', async ({ page }) => {
  await installActionBridge(page, { ok: false });
  await askForRemoteAction(page);

  await page.getByRole('alert').getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText('A ação remota não foi aceita por slack.')).toBeVisible();
});

test('o companion apresenta a mesma confirmação e pode aprová-la pelo notch', async ({ page }) => {
  await installActionBridge(page);
  await askForRemoteAction(page);
  await expect(page.getByRole('alert').getByRole('button', { name: 'Confirmar' })).toBeVisible();

  const presentation = await page.evaluate(() => {
    const notch = (window as unknown as { hibiE2E: { notch: { kind: string; requestId: string; actions: { id: string; label: string }[] }[] } }).hibiE2E.notch;
    return notch.find((entry) => entry.kind === 'confirmation') ?? null;
  });
  expect(presentation).not.toBeNull();
  expect(presentation!.actions.map((action) => action.id)).toEqual(['confirm', 'cancel']);

  await page.evaluate((requestId) => (window as unknown as { hibiE2E: { companionConfirm: (id: string) => void } }).hibiE2E.companionConfirm(requestId), presentation!.requestId);
  await expect(page.getByText('Ação enviada para slack: slack.post')).toBeVisible();
  expect(await bridgeCalls(page)).toEqual(['prepare:slack:slack.post:{"channel":"#geral","text":"reunião às 10h"}', 'execute:action-1:confirm-1']);
});

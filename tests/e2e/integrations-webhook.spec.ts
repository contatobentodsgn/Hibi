import { test, expect, type Page } from '@playwright/test';

const STATE_KEY = 'hibi-e2e-webhook-bridge';

// Simula a ponte do app desktop no navegador: o estado do webhook vive fora da
// interface (no processo principal, com o segredo no Keychain), então aqui ele é
// mantido em localStorage para sobreviver a um reinício simulado da janela.
async function installDesktopBridge(page: Page) {
  await page.addInitScript((stateKey) => {
    const read = () => {
      try {
        return JSON.parse(window.localStorage.getItem(stateKey) ?? 'null') ?? { running: false, hasSecret: false };
      } catch {
        return { running: false, hasSecret: false };
      }
    };
    const write = (next: { running: boolean; hasSecret: boolean; origin?: string }) => {
      try {
        window.localStorage.setItem(stateKey, JSON.stringify(next));
      } catch {
        /* armazenamento indisponível */
      }
      return next;
    };
    const status = () => {
      const state = read();
      return state.running ? { ...state, origin: 'http://127.0.0.1:4599' } : { running: false, hasSecret: state.hasSecret };
    };
    (window as unknown as { hibiDesktop: Record<string, unknown> }).hibiDesktop = {
      info: async () => ({ name: 'Hibi', version: '0.1.0', localOnly: true }),
      getWebhookStatus: async () => status(),
      configureWebhook: async (secret: string) => {
        if (!secret) throw new Error('missing secret');
        write({ ...read(), hasSecret: true });
        return status();
      },
      startWebhook: async () => {
        const state = read();
        if (!state.hasSecret) throw new Error('missing secret');
        write({ ...state, running: true });
        return status();
      },
      stopWebhook: async () => {
        write({ ...read(), running: false });
        return status();
      },
      listIntegrationAudit: async () => [
        { at: '2026-09-09T14:05:00.000Z', action: 'webhook-inbound', connectorId: 'slack', detail: 'Authorization: [redacted]' },
        { at: '2026-09-09T13:40:00.000Z', action: 'integration-connect', connectorId: 'notion', detail: 'Token saved in Keychain' },
      ],
    };
  }, STATE_KEY);
}

async function openIntegrations(page: Page) {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('navigation', { name: 'Navegação interna de ajustes' }).getByRole('button', { name: /^Integrações/ }).click();
  await expect(page.getByRole('region', { name: 'Integrations' })).toBeVisible();
}

test('inicia e para o webhook local e preserva o estado após reiniciar a janela', async ({ page }) => {
  await installDesktopBridge(page);
  await openIntegrations(page);

  await page.getByLabel('Webhook signing secret').fill('segredo-de-assinatura-local');
  await page.getByRole('button', { name: 'Save secret' }).click();
  await expect(page.getByText('Webhook secret saved in Keychain.')).toBeVisible();
  await expect(page.getByLabel('Webhook signing secret')).toHaveCount(0);

  await page.getByRole('button', { name: 'Start webhook' }).click();
  await expect(page.getByText('Webhook listening at http://127.0.0.1:4599.')).toBeVisible();
  await expect(page.getByText('http://127.0.0.1:4599/webhook · Loopback only')).toBeVisible();

  // Reinício da janela: o estado precisa vir da ponte, não da memória da interface.
  await page.reload();
  await openIntegrations(page);
  await expect(page.getByRole('button', { name: 'Stop webhook' })).toBeVisible();
  await expect(page.getByText('http://127.0.0.1:4599/webhook · Loopback only')).toBeVisible();

  await page.getByRole('button', { name: 'Stop webhook' }).click();
  await expect(page.getByText('Local webhook stopped.')).toBeVisible();
  await expect(page.getByText('/webhook · Loopback only')).toHaveCount(0);

  await page.reload();
  await openIntegrations(page);
  await expect(page.getByRole('button', { name: 'Start webhook' })).toBeVisible();
  await expect(page.getByLabel('Webhook signing secret')).toHaveCount(0);
});

test('recusa iniciar o webhook sem um segredo de assinatura', async ({ page }) => {
  await installDesktopBridge(page);
  await openIntegrations(page);

  await page.getByRole('button', { name: 'Save secret' }).click();
  await expect(page.getByText('Paste a webhook signing secret first.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start webhook' })).toHaveCount(0);
});

test('exibe o histórico completo de auditoria, e não apenas a contagem', async ({ page }) => {
  await installDesktopBridge(page);
  await openIntegrations(page);

  await expect(page.getByText('2 safe local audit entries')).toBeVisible();
  const history = page.getByRole('list', { name: 'Integration audit history' });
  await expect(history.getByRole('listitem')).toHaveCount(2);

  const newest = history.getByRole('listitem').first();
  await expect(newest).toContainText('2026-09-09 14:05');
  await expect(newest).toContainText('slack');
  await expect(newest).toContainText('webhook-inbound');
  await expect(newest).toContainText('Authorization: [redacted]');
  await expect(history.getByRole('listitem').nth(1)).toContainText('integration-connect');
});

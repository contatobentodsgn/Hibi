import { test, expect, type Page } from '@playwright/test';

// Ponte simulada do app desktop. Guarda o que foi salvo para que os testes
// verifiquem o que a interface realmente enviou ao processo principal.
async function installConnectorBridge(page: Page) {
  await page.addInitScript(() => {
    const settings: Record<string, { endpoint: string; clientId: string; targets: { id: string; label: string }[]; authorizationUrl: string; tokenUrl: string }> = {};
    const connected = new Set<string>();
    const calls: string[] = [];
    const entry = (id: string) => settings[id] ?? (settings[id] = { endpoint: '', clientId: '', targets: [], authorizationUrl: '', tokenUrl: '' });
    const state = (id: string, label: string, capabilities: string[]) => ({ id, label, capabilities, state: connected.has(id) ? 'connected' : 'disconnected', hasCredential: connected.has(id) });
    (window as unknown as { hibiE2E: unknown }).hibiE2E = { settings, calls };
    (window as unknown as { hibiDesktop: Record<string, unknown> }).hibiDesktop = {
      info: async () => ({ name: 'Hibi', version: '0.1.0', localOnly: true }),
      listIntegrationStatus: async () => [
        state('notion', 'Notion', ['import', 'write', 'sync']),
        state('slack', 'Slack', ['import', 'write', 'sync']),
        state('email', 'Email', ['import', 'write']),
        state('remote-notifications', 'Remote notifications', ['notify', 'write']),
      ],
      listIntegrationAudit: async () => [],
      // Espelha o processo principal: o OAuth embutido pertence ao serviço padrão,
      // e um endpoint próprio só tem OAuth com as duas URLs configuradas.
      isOauthSupported: async (id: string) => {
        const current = entry(id);
        if (current.authorizationUrl && current.tokenUrl) return true;
        if (current.endpoint) return false;
        return ['notion', 'slack'].includes(id);
      },
      getConnectorSettings: async (id: string) => ({ ...entry(id) }),
      saveConnectorSettings: async (id: string, patch: Record<string, unknown>) => {
        const current = entry(id);
        if (typeof patch.endpoint === 'string') {
          if (patch.endpoint && !patch.endpoint.startsWith('https://')) throw new Error('Connector endpoint must use HTTPS.');
          current.endpoint = patch.endpoint ? `${patch.endpoint.replace(/\/$/, '')}/` : '';
        }
        if (typeof patch.clientId === 'string') current.clientId = patch.clientId;
        for (const key of ['authorizationUrl', 'tokenUrl'] as const) {
          const value = patch[key];
          if (typeof value !== 'string') continue;
          if (value && !value.startsWith('https://')) throw new Error('Connector authorization URL must use HTTPS.');
          current[key] = value;
        }
        if (Array.isArray(patch.targets)) current.targets = patch.targets as { id: string; label: string }[];
        calls.push(`save:${id}`);
        return { ...current };
      },
      authorizeIntegration: async (id: string) => {
        if (!entry(id).clientId) throw new Error('A client identifier from the service is required.');
        calls.push(`authorize:${id}`);
        connected.add(id);
        return { connectorId: id, connected: true, hasRefreshToken: true };
      },
      testIntegrationConnection: async (id: string) => {
        calls.push(`test:${id}`);
        return id === 'slack' ? { ok: true, detail: 'Connected to Estúdio.' } : { ok: false, detail: 'Rejected this credential.' };
      },
      listIntegrationImportTargets: async (id: string) => {
        calls.push(`targets:${id}`);
        return [{ id: 'C1', label: '#geral' }, { id: 'C2', label: '#avisos' }];
      },
      getWebhookStatus: async () => ({ running: false, hasSecret: false }),
    };
  });
}

async function openIntegrations(page: Page) {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('button', { name: 'Integrations', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Integrations' })).toBeVisible();
}

const bridgeCalls = (page: Page) => page.evaluate(() => (window as unknown as { hibiE2E: { calls: string[] } }).hibiE2E.calls);

test('autoriza um conector por OAuth somente depois do client id configurado', async ({ page }) => {
  await installConnectorBridge(page);
  await openIntegrations(page);

  const slackRow = page.locator('[data-connector="slack"]');
  await slackRow.getByRole('button', { name: 'Authorize' }).click();
  await expect(page.getByText('Add the client identifier supplied by the service before authorizing.')).toBeVisible();
  expect(await bridgeCalls(page)).not.toContain('authorize:slack');

  await slackRow.getByRole('button', { name: 'Configure' }).click();
  await page.getByLabel('Slack client identifier').fill('client-slack-1');
  await page.getByLabel('Slack client identifier').blur();
  await expect(page.getByText('Connector configuration saved on this Mac.')).toBeVisible();

  await slackRow.getByRole('button', { name: 'Authorize' }).click();
  await expect(page.getByText('Authorized. Tokens stay in Keychain and can be refreshed.')).toBeVisible();
  expect(await bridgeCalls(page)).toContain('authorize:slack');
  await expect(page.getByRole('button', { name: 'Test connection' })).toBeVisible();
});

test('testa a conexão e mostra o resultado sem executar escrita', async ({ page }) => {
  await installConnectorBridge(page);
  await openIntegrations(page);

  const slackRow = page.locator('[data-connector="slack"]');
  await slackRow.getByRole('button', { name: 'Configure' }).click();
  await page.getByLabel('Slack client identifier').fill('client-slack-1');
  await page.getByLabel('Slack client identifier').blur();
  await slackRow.getByRole('button', { name: 'Authorize' }).click();
  await expect(page.getByRole('button', { name: 'Test connection' })).toBeVisible();

  await slackRow.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Connection test passed: Connected to Estúdio.')).toBeVisible();
});

test('salva um endpoint HTTPS e recusa um endpoint inseguro', async ({ page }) => {
  await installConnectorBridge(page);
  await openIntegrations(page);

  const emailRow = page.locator('[data-connector="email"]');
  await emailRow.getByRole('button', { name: 'Configure' }).click();

  const endpoint = page.getByLabel('Email endpoint');
  await endpoint.fill('https://mail.example.test/api');
  await endpoint.blur();
  await expect(page.getByText('Connector configuration saved on this Mac.')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { hibiE2E: { settings: Record<string, { endpoint: string }> } }).hibiE2E.settings.email.endpoint)).toBe('https://mail.example.test/api/');

  await endpoint.fill('http://mail.example.test/api');
  await endpoint.blur();
  await expect(page.getByText('Connector endpoint must use HTTPS.')).toBeVisible();
});

test('escolhe quais canais são importados e mantém a seleção', async ({ page }) => {
  await installConnectorBridge(page);
  await openIntegrations(page);

  const slackRow = page.locator('[data-connector="slack"]');
  await slackRow.getByRole('button', { name: 'Configure' }).click();
  await page.getByLabel('Slack client identifier').fill('client-slack-1');
  await page.getByLabel('Slack client identifier').blur();
  await slackRow.getByRole('button', { name: 'Authorize' }).click();

  await expect(page.getByText('Nothing selected yet; imports stay empty until you choose a source.')).toBeVisible();
  await slackRow.getByRole('button', { name: 'Load available sources' }).click();
  const sources = page.getByRole('list', { name: 'Slack import sources' });
  await expect(sources.getByRole('checkbox')).toHaveCount(2);

  await sources.getByRole('checkbox', { name: '#geral' }).check();
  await expect(page.getByText('1 selected · only these are imported')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { hibiE2E: { settings: Record<string, { targets: unknown[] }> } }).hibiE2E.settings.slack.targets)).toEqual([{ id: 'C1', label: '#geral' }]);

  await sources.getByRole('checkbox', { name: '#geral' }).uncheck();
  await expect(page.getByText('Nothing selected yet; imports stay empty until you choose a source.')).toBeVisible();
});

test('um endpoint próprio desliga o OAuth até as URLs de autorização serem configuradas', async ({ page }) => {
  await installConnectorBridge(page);
  await openIntegrations(page);

  const slackRow = page.locator('[data-connector="slack"]');
  await expect(slackRow.getByRole('button', { name: 'Authorize' })).toBeVisible();
  await slackRow.getByRole('button', { name: 'Configure' }).click();

  const endpoint = page.getByLabel('Slack endpoint');
  await endpoint.fill('https://slack.interno.example/api');
  await endpoint.blur();

  // Nem erro de allowlist, nem promessa de um fluxo que não existe: o estado é dito.
  await expect(page.getByText('This connector uses a direct credential.')).toBeVisible();
  await expect(slackRow.getByRole('button', { name: 'Authorize' })).toHaveCount(0);

  const authorizationUrl = page.getByLabel('Slack authorization URL');
  await authorizationUrl.fill('https://login.interno.example/oauth/authorize');
  await authorizationUrl.blur();
  await expect(page.getByText('Connector configuration saved on this Mac.')).toBeVisible();
  await expect(slackRow.getByRole('button', { name: 'Authorize' })).toHaveCount(0);

  const tokenUrl = page.getByLabel('Slack token URL');
  await tokenUrl.fill('https://login.interno.example/oauth/token');
  await tokenUrl.blur();
  await expect(slackRow.getByRole('button', { name: 'Authorize' })).toBeVisible();
  await expect(page.getByText('This connector uses a direct credential.')).toHaveCount(0);
});

test('recusa uma URL de autorização sem HTTPS', async ({ page }) => {
  await installConnectorBridge(page);
  await openIntegrations(page);

  const emailRow = page.locator('[data-connector="email"]');
  await emailRow.getByRole('button', { name: 'Configure' }).click();
  const authorizationUrl = page.getByLabel('Email authorization URL');
  await authorizationUrl.fill('http://login.interno.example/oauth/authorize');
  await authorizationUrl.blur();
  await expect(page.getByText('Connector authorization URL must use HTTPS.')).toBeVisible();
});

test('não oferece autorização OAuth para conectores que não a suportam', async ({ page }) => {
  await installConnectorBridge(page);
  await openIntegrations(page);

  const notificationsRow = page.locator('[data-connector="remote-notifications"]');
  await expect(notificationsRow.getByRole('button', { name: 'Authorize' })).toHaveCount(0);
  await notificationsRow.getByRole('button', { name: 'Configure' }).click();
  await expect(page.getByLabel('Remote notifications endpoint')).toBeVisible();
  await expect(page.getByLabel('Remote notifications client identifier')).toHaveCount(0);
});

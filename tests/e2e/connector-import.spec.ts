import { test, expect, type Page } from '@playwright/test';

async function installImportBridge(page: Page) {
  await page.addInitScript(() => {
    const settings: Record<string, { endpoint: string; clientId: string; targets: { id: string; label: string }[] }> = {};
    const calls: string[] = [];
    const entry = (id: string) => settings[id] ?? (settings[id] = { endpoint: '', clientId: '', targets: [] });
    (window as unknown as { hibiE2E: unknown }).hibiE2E = { calls, settings };
    (window as unknown as { hibiDesktop: Record<string, unknown> }).hibiDesktop = {
      info: async () => ({ name: 'Hibi', version: '0.1.0', localOnly: true }),
      listIntegrationStatus: async () => [{ id: 'slack', label: 'Slack', capabilities: ['import', 'write', 'sync'], state: 'connected', hasCredential: true }],
      listIntegrationAudit: async () => [],
      isOauthSupported: async () => true,
      getConnectorSettings: async (id: string) => ({ ...entry(id) }),
      saveConnectorSettings: async (id: string, patch: Record<string, unknown>) => {
        const current = entry(id);
        if (Array.isArray(patch.targets)) current.targets = patch.targets as { id: string; label: string }[];
        return { ...current };
      },
      listIntegrationImportTargets: async () => [{ id: 'C1', label: '#geral' }],
      listIntegrationImportCandidates: async (id: string) => {
        const chosen = entry(id).targets;
        calls.push(`import:${id}:${chosen.map((target) => target.id).join(',')}`);
        return [{ remoteId: 'C1:1.1', title: 'Reunião de segunda', kind: 'task', revision: 'v1' }];
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

async function chooseSource(page: Page) {
  const slack = page.locator('[data-connector="slack"]');
  await slack.getByRole('button', { name: 'Configure' }).click();
  await slack.getByRole('button', { name: 'Load available sources' }).click();
  await page.getByRole('list', { name: 'Slack import sources' }).getByRole('checkbox', { name: '#geral' }).check();
  return slack;
}

test('a leitura só é liberada depois de escolher uma fonte', async ({ page }) => {
  await installImportBridge(page);
  await openIntegrations(page);

  const slack = page.locator('[data-connector="slack"]');
  await slack.getByRole('button', { name: 'Configure' }).click();
  await expect(slack.getByRole('button', { name: 'Read for import' })).toBeDisabled();

  await slack.getByRole('button', { name: 'Load available sources' }).click();
  await page.getByRole('list', { name: 'Slack import sources' }).getByRole('checkbox', { name: '#geral' }).check();
  await expect(slack.getByRole('button', { name: 'Read for import' })).toBeEnabled();
});

test('lê do conector para a prévia sem importar nada antes da decisão', async ({ page }) => {
  await installImportBridge(page);
  await openIntegrations(page);
  const slack = await chooseSource(page);

  await slack.getByRole('button', { name: 'Read for import' }).click();
  await expect(page.getByText('1 items read from slack; nothing has been imported yet.')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { hibiE2E: { calls: string[] } }).hibiE2E.calls)).toEqual(['import:slack:C1']);

  // O item aparece como novo e o workspace segue intocado até aplicar.
  await expect(page.getByText('Reunião de segunda')).toBeVisible();
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Tarefas', exact: true }).click();
  await expect(page.getByText('Reunião de segunda')).toHaveCount(0);
});

test('aplicar a decisão cria a tarefa e uma segunda leitura reconhece a duplicata', async ({ page }) => {
  await installImportBridge(page);
  await openIntegrations(page);
  const slack = await chooseSource(page);

  await slack.getByRole('button', { name: 'Read for import' }).click();
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('Import decision applied to the local workspace.')).toBeVisible();

  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Tarefas', exact: true }).click();
  await expect(page.getByText('Reunião de segunda')).toBeVisible();

  // A referência remota precisa ter gravado o conector, senão o item voltaria como novo.
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('button', { name: 'Integrations', exact: true }).click();
  const reopened = page.locator('[data-connector="slack"]');
  await reopened.getByRole('button', { name: 'Configure' }).click();
  await reopened.getByRole('button', { name: 'Read for import' }).click();
  await expect(page.getByText('duplicate')).toBeVisible();
});

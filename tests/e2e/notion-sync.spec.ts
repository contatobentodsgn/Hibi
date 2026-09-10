import { test, expect, type Page } from '@playwright/test';

// A ponte de teste registra tudo que sairia para o Notion. O painel só pode escrever
// através de `executeApprovedIntegrationAction`, então `writes` estar vazio é a prova
// direta de que nada foi aplicado no serviço remoto.
type Recorded = {
  prepared: { kind: string; keys: string[] }[];
  writes: { actionId: string; confirmationId: string }[];
  notch: { requestId: string; text: string }[];
  hidden: string[];
};

type BridgeOptions = { failFirstOperation?: boolean; configured?: boolean };

async function installNotionBridge(page: Page, options: BridgeOptions = {}) {
  await page.addInitScript(([failFirstOperation, configured]: [boolean, boolean]) => {
    const recorded = { prepared: [], writes: [], notch: [], hidden: [] } as {
      prepared: { kind: string; keys: string[] }[];
      writes: { actionId: string; confirmationId: string }[];
      notch: { requestId: string; text: string }[];
      hidden: string[];
    };
    let companion: ((action: { requestId: string; actionId: 'confirm' | 'cancel' }) => void) | null = null;
    let preparedCount = 0;
    const actionsById = new Map<string, { kind: string; operations: { key: string }[] }>();

    let notionSettings: Record<string, unknown> = configured ? {
      endpoint: '',
      clientId: '',
      targets: [{ id: 'source-1', label: 'Hibi Tasks' }],
      notion: {
        workspaceLabel: "Kizuna Std's Notion",
        parentPageId: 'page-kizuna',
        databaseId: 'db-1',
        dataSourceId: 'source-1',
        lastSyncAt: '',
        lastSummary: { imported: 0, pushed: 0, updated: 0, skipped: 0, failed: 0, conflicts: 0 },
        checkpoints: [],
      },
    } : { endpoint: '', clientId: '', targets: [] };

    (window as unknown as { hibiE2E: unknown }).hibiE2E = {
      recorded,
      // Dispara a ação do notch sobre a última confirmação apresentada.
      notchAction(actionId: 'confirm' | 'cancel') {
        const last = recorded.notch[recorded.notch.length - 1];
        if (last && companion) companion({ requestId: last.requestId, actionId });
      },
    };

    (window as unknown as { hibiDesktop: Record<string, unknown> }).hibiDesktop = {
      info: async () => ({ name: 'Hibi', version: '0.1.0', localOnly: true }),
      listIntegrationStatus: async () => [
        { id: 'notion', label: 'Notion', capabilities: ['import', 'write', 'sync'], state: 'connected', hasCredential: true },
      ],
      listIntegrationAudit: async () => [],
      isOauthSupported: async () => false,
      getConnectorSettings: async () => JSON.parse(JSON.stringify(notionSettings)),
      saveConnectorSettings: async (_id: string, patch: Record<string, unknown>) => {
        notionSettings = { ...notionSettings, ...patch };
        return JSON.parse(JSON.stringify(notionSettings));
      },
      listIntegrationImportTargets: async () => [{ id: 'source-1', label: 'Hibi Tasks' }],
      // Uma tarefa que só existe no Notion, para a prévia nunca ficar vazia.
      listIntegrationImportCandidates: async () => [
        { remoteId: 'page-remote-1', title: 'Tarefa só do Notion', kind: 'task', revision: 'v1' },
      ],
      prepareIntegrationAction: async (input: { kind: string; payload: Record<string, unknown> }) => {
        const operations = (input.payload.operations as { key: string }[] | undefined) ?? [];
        recorded.prepared.push({ kind: input.kind, keys: operations.map((operation) => operation.key) });
        preparedCount += 1;
        const id = `action-${preparedCount}`;
        actionsById.set(id, { kind: input.kind, operations });
        return { id, confirmationId: `confirmation-${preparedCount}`, connectorId: 'notion', kind: input.kind };
      },
      executeApprovedIntegrationAction: async (input: { actionId: string; confirmationId: string }) => {
        recorded.writes.push({ actionId: input.actionId, confirmationId: input.confirmationId });
        const action = actionsById.get(input.actionId) ?? { kind: '', operations: [] };
        if (action.kind === 'notion.database.create') return { ok: true, remoteId: 'db-created' };
        const items = action.operations.map((operation, index) => failFirstOperation && index === 0
          ? { key: operation.key, ok: false, error: 'notion_rate_limited' }
          : { key: operation.key, ok: true, remoteId: `page-${operation.key}`, revision: `rev-${operation.key}` });
        return { ok: items.every((item) => item.ok), items };
      },
      discoverNotionDataSource: async (databaseId: string) => ({ databaseId, dataSourceId: 'source-created', label: 'Hibi Tasks' }),
      showNotch: async (presentation: { requestId: string; text: string }) => {
        recorded.notch.push({ requestId: presentation.requestId, text: presentation.text });
        return true;
      },
      hideNotch: async (requestId: string) => { recorded.hidden.push(requestId); return true; },
      onCompanionAction: (callback: (action: { requestId: string; actionId: 'confirm' | 'cancel' }) => void) => {
        companion = callback;
        return () => { companion = null; };
      },
      getWebhookStatus: async () => ({ running: false, hasSecret: false }),
    };
  }, [options.failFirstOperation ?? false, options.configured ?? true] as [boolean, boolean]);
}

const readRecorded = (page: Page) => page.evaluate(() => (window as unknown as { hibiE2E: { recorded: Recorded } }).hibiE2E.recorded);

// Mesma rota do dock que os outros specs de integrações usam: Ajustes vive atrás do "···".
async function openIntegrations(page: Page) {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('button', { name: 'Integrations', exact: true }).click();
}

async function openNotionPanel(page: Page) {
  await openIntegrations(page);
  await expect(page.getByRole('region', { name: 'Notion task synchronization' })).toBeVisible();
}

async function previewChanges(page: Page) {
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.getByRole('heading', { name: 'Review changes' })).toBeVisible();
}

test('nenhuma escrita no Notion acontece antes de confirmar', async ({ page }) => {
  await installNotionBridge(page);
  await openNotionPanel(page);
  await previewChanges(page);

  // Ler a base já não pode ter escrito nada.
  expect((await readRecorded(page)).writes).toEqual([]);

  await page.getByRole('button', { name: 'Review selected changes' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Confirm synchronization' })).toBeVisible();

  const recorded = await readRecorded(page);
  expect(recorded.prepared.length).toBe(1);
  expect(recorded.prepared[0].kind).toBe('notion.sync.batch');
  // Preparar não é escrever: o lote está montado e ainda não saiu daqui.
  expect(recorded.writes).toEqual([]);
});

test('cancelar no app descarta o lote sem escrever', async ({ page }) => {
  await installNotionBridge(page);
  await openNotionPanel(page);
  await previewChanges(page);
  await page.getByRole('button', { name: 'Review selected changes' }).click();

  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('Synchronization cancelled. No selected change was applied.')).toBeVisible();

  const recorded = await readRecorded(page);
  expect(recorded.writes).toEqual([]);
  // O cartão do notch é retirado junto, para não ficar uma confirmação órfã flutuando.
  expect(recorded.hidden).toEqual([recorded.notch[recorded.notch.length - 1].requestId]);
});

test('confirmar pelo notch aplica o mesmo lote preparado', async ({ page }) => {
  await installNotionBridge(page);
  await openNotionPanel(page);
  await previewChanges(page);
  await page.getByRole('button', { name: 'Review selected changes' }).click();

  const before = await readRecorded(page);
  expect(before.notch.length).toBe(1);
  expect(before.writes).toEqual([]);

  await page.evaluate(() => (window as unknown as { hibiE2E: { notchAction: (id: string) => void } }).hibiE2E.notchAction('confirm'));
  await expect(page.getByText(/Sync complete/)).toBeVisible();

  const recorded = await readRecorded(page);
  expect(recorded.writes.length).toBe(1);
  expect(recorded.writes[0].confirmationId).toBe(before.notch[0].requestId);
});

test('cancelar pelo notch não escreve nada', async ({ page }) => {
  await installNotionBridge(page);
  await openNotionPanel(page);
  await previewChanges(page);
  await page.getByRole('button', { name: 'Review selected changes' }).click();

  await page.evaluate(() => (window as unknown as { hibiE2E: { notchAction: (id: string) => void } }).hibiE2E.notchAction('cancel'));
  await expect(page.getByText('Synchronization cancelled. No selected change was applied.')).toBeVisible();

  expect((await readRecorded(page)).writes).toEqual([]);
});

// Regressão: o painel passou a usar o valor devolvido pela gravação. Se a fiação
// devolver a configuração anterior em vez da recém-salva, o dataSourceId criado no
// setup se perde e "Sync now" vira um botão morto — sem nenhum erro visível.
test('a base criada no setup fica utilizável na mesma sessão', async ({ page }) => {
  await installNotionBridge(page, { configured: false });
  await openIntegrations(page);
  await expect(page.getByRole('region', { name: 'Notion sync setup' })).toBeVisible();

  await page.getByRole('button', { name: 'Prepare Hibi Tasks' }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('Hibi Tasks is ready inside Kizuna.')).toBeVisible();

  // Sem recarregar nem sair da tela: a sincronização precisa achar a base recém-criada.
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.getByRole('heading', { name: 'Review changes' })).toBeVisible();
});

test('repetir depois de uma falha parcial reenvia só o item pendente', async ({ page }) => {
  await installNotionBridge(page, { failFirstOperation: true });
  await openNotionPanel(page);
  await previewChanges(page);
  await page.getByRole('button', { name: 'Review selected changes' }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();

  await expect(page.getByText('1 change(s) failed. Retry will include only pending items.')).toBeVisible();

  const afterFirst = await readRecorded(page);
  const firstBatch = afterFirst.prepared[0].keys;
  expect(firstBatch.length).toBeGreaterThan(1);
  const failedKey = firstBatch[0];

  await page.getByRole('button', { name: 'Retry 1 pending' }).click();
  const afterRetry = await readRecorded(page);
  expect(afterRetry.prepared.length).toBe(2);
  // O reenvio não pode arrastar de volta o que já entrou no Notion.
  expect(afterRetry.prepared[1].keys).toEqual([failedKey]);
});

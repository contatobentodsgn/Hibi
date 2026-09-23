import { test, expect, type Page } from '@playwright/test';

type CompanionAction = Readonly<{ requestId: string; actionId: 'confirm' | 'cancel' }>;
type HibiE2E = {
  calls: string[];
  companionAction: (input: CompanionAction) => void;
  editRemotePage: () => void;
  breakReads: () => void;
};

// O painel do Notion tem o próprio caminho de confirmação, separado do cartão da API local: ele
// mesmo apresenta o notch, ele mesmo o retira, e só depois libera a escrita. `notion-sync.spec.ts`
// cobre o que sai para o Notion; aqui a pergunta é a outra metade da barreira — o que é aplicado
// *neste Mac*, que nenhum registro de escrita remota observa.
//
// O dublê guarda UM log ordenado em vez de contadores soltos: preparar, apresentar, retirar e
// executar são quatro momentos distintos, e a ordem entre eles é parte do contrato. Com o log, cada
// teste verifica identidade, resposta e ordem numa asserção só.
async function installNotionConfirmationBridge(page: Page) {
  await page.addInitScript(() => {
    const calls: string[] = [];
    // `ipcRenderer.on` aceita vários ouvintes ao mesmo tempo, e o painel conta com isso: o efeito de
    // `onCompanionAction` reassina a cada mudança de `pending`. O dublê guarda a lista e devolve o
    // cancelamento certo — com um ouvinte só, a ação do notch cairia num closure velho e o teste
    // passaria afirmando algo falso.
    const companionListeners: ((action: CompanionAction) => void)[] = [];
    let preparedCount = 0;
    let remoteRevision = 'v1';
    let readsBroken = false;
    const operationsByAction = new Map<string, { key: string }[]>();

    let settings: Record<string, unknown> = {
      endpoint: '', clientId: '', targets: [{ id: 'source-1', label: 'Pixano Tasks' }],
      notion: {
        workspaceLabel: "Kizuna Std's Notion", parentPageId: 'page-kizuna', databaseId: 'db-1', dataSourceId: 'source-1',
        lastSyncAt: '', lastSummary: { imported: 0, pushed: 0, updated: 0, skipped: 0, failed: 0, conflicts: 0 }, checkpoints: [],
      },
    };

    const e2e: HibiE2E = {
      calls,
      companionAction: (input) => companionListeners.forEach((listener) => listener(input)),
      // Alguém edita a página no Notion entre a prévia e a confirmação.
      editRemotePage: () => { remoteRevision = 'v2'; },
      breakReads: () => { readsBroken = true; },
    };
    (window as unknown as { hibiE2E: HibiE2E }).hibiE2E = e2e;

    (window as unknown as { hibiDesktop: Record<string, unknown> }).hibiDesktop = {
      info: async () => ({ name: 'Hibi', version: '0.1.0', localOnly: true }),
      listIntegrationStatus: async () => [{ id: 'notion', label: 'Notion', capabilities: ['import', 'write', 'sync'], state: 'connected', hasCredential: true }],
      listIntegrationAudit: async () => [],
      isOauthSupported: async () => false,
      getWebhookStatus: async () => ({ running: false, hasSecret: false }),
      getConnectorSettings: async () => JSON.parse(JSON.stringify(settings)),
      saveConnectorSettings: async (_id: string, patch: Record<string, unknown>) => { settings = { ...settings, ...patch }; return JSON.parse(JSON.stringify(settings)); },
      listIntegrationImportTargets: async () => [{ id: 'source-1', label: 'Pixano Tasks' }],
      // Uma tarefa que só existe no Notion: é ela que a aprovação precisa criar aqui, e é a ausência
      // dela no workspace que prova que a confirmação segurou a mudança.
      listIntegrationImportCandidates: async () => { if (readsBroken) throw new Error('Notion is unreachable.'); return [{ remoteId: 'page-remote-1', title: 'Tarefa só do Notion', kind: 'task', revision: remoteRevision }]; },
      prepareIntegrationAction: async (input: { kind: string; payload: Record<string, unknown> }) => {
        preparedCount += 1;
        const id = `action-${preparedCount}`;
        operationsByAction.set(id, (input.payload.operations as { key: string }[] | undefined) ?? []);
        calls.push(`prepare:${input.kind}`);
        return { id, confirmationId: `confirmation-${preparedCount}`, connectorId: 'notion', kind: input.kind };
      },
      executeApprovedIntegrationAction: async (input: { actionId: string; confirmationId: string }) => {
        calls.push(`execute:${input.confirmationId}`);
        const items = (operationsByAction.get(input.actionId) ?? []).map((operation) => ({ key: operation.key, ok: true, remoteId: `page-${operation.key}`, revision: `rev-${operation.key}` }));
        return { ok: true, items };
      },
      showNotch: async (presentation: { requestId: string }) => { calls.push(`show:${presentation.requestId}`); return { degraded: false, requestId: presentation.requestId }; },
      hideNotch: async (requestId: string) => { calls.push(`hide:${requestId}`); return true; },
      onCompanionAction: (callback: (action: CompanionAction) => void) => {
        companionListeners.push(callback);
        return () => { const index = companionListeners.indexOf(callback); if (index >= 0) companionListeners.splice(index, 1); };
      },
    };
  });
}

const REMOTE_TASK = 'Tarefa só do Notion';
const CONFIRMATION_ID = 'confirmation-1';
const PREPARED = 'prepare:notion.sync.batch';
const SHOWN = `show:${CONFIRMATION_ID}`;
const DISMISSED = `hide:${CONFIRMATION_ID}`;
const EXECUTED = `execute:${CONFIRMATION_ID}`;

const card = (page: Page) => page.getByRole('alert').filter({ hasText: 'Confirm synchronization' });
const calls = (page: Page) => page.evaluate(() => (window as unknown as { hibiE2E: HibiE2E }).hibiE2E.calls);
const notchAction = (page: Page, actionId: 'confirm' | 'cancel', requestId = CONFIRMATION_ID) =>
  page.evaluate((input) => (window as unknown as { hibiE2E: HibiE2E }).hibiE2E.companionAction(input), { requestId, actionId });
// Sumir da tela não basta como prova de que nada foi aplicado: isto lê o workspace que o App
// persiste a cada mudança de dados, que é o que sobrevive ao recarregar. A tarefa que só existe no
// Notion aparece por `pull-create`; `remoteRef` aparece em qualquer tarefa local que tenha sido
// ligada a uma página — os dois lados do que esta confirmação aplicaria.
const workspace = (page: Page) => page.evaluate(() => window.localStorage.getItem('hibi-study-data') ?? '');

async function openReview(page: Page) {
  await installNotionConfirmationBridge(page);
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('navigation', { name: 'Navegação interna de ajustes' }).getByRole('button', { name: /^Integrações/ }).click();
  await expect(page.getByRole('region', { name: 'Notion task synchronization' })).toBeVisible();
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.getByRole('heading', { name: 'Review changes' })).toBeVisible();
  // Ler a base não é aplicar nada: o workspace ainda é o do seed.
  const before = await workspace(page);
  expect(before).not.toContain(REMOTE_TASK);
  expect(before).not.toContain('remoteRef');
}

async function askConfirmation(page: Page) {
  await page.getByRole('button', { name: 'Review selected changes' }).click();
  await expect(card(page)).toBeVisible();
}

test('a confirmação da sincronização abre sem aplicar nada, nem no Notion nem no workspace', async ({ page }) => {
  await openReview(page);
  await askConfirmation(page);

  await expect(card(page)).toContainText('No selected change has been applied yet.');

  // A garantia que a barreira inteira promete: preparar o lote não é escrever, e nada do lado local
  // acontece enquanto a pergunta está na tela.
  expect(await calls(page)).toEqual([PREPARED, SHOWN]);
  const pending = await workspace(page);
  expect(pending).not.toContain(REMOTE_TASK);
  expect(pending).not.toContain('remoteRef');
});

test('confirmar no cartão descarta a apresentação, executa o lote preparado e aplica as mudanças locais', async ({ page }) => {
  await openReview(page);
  await askConfirmation(page);

  await card(page).getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText(/Sync complete/)).toBeVisible();

  await expect(card(page)).toHaveCount(0);
  // A apresentação é retirada antes de a escrita sair: sem isso, uma confirmação já respondida fica
  // no notch esperando uma segunda resposta.
  expect(await calls(page)).toEqual([PREPARED, SHOWN, DISMISSED, EXECUTED]);
  const applied = await workspace(page);
  expect(applied).toContain(REMOTE_TASK);
  expect(applied).toContain('remoteRef');
});

test('cancelar no cartão não executa o lote e não deixa rastro no workspace', async ({ page }) => {
  await openReview(page);
  await askConfirmation(page);

  await card(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('Synchronization cancelled. No selected change was applied.')).toBeVisible();

  await expect(card(page)).toHaveCount(0);
  expect(await calls(page)).toEqual([PREPARED, SHOWN, DISMISSED]);
  const refused = await workspace(page);
  expect(refused).not.toContain(REMOTE_TASK);
  expect(refused).not.toContain('remoteRef');
});

test('responder pelo notch resolve a mesma confirmação que os botões do cartão', async ({ page }) => {
  await openReview(page);
  await askConfirmation(page);

  // Uma ação de outra apresentação não pode responder por esta confirmação.
  await notchAction(page, 'confirm', 'outra-confirmacao');
  await expect(card(page)).toBeVisible();
  expect(await calls(page)).toEqual([PREPARED, SHOWN]);

  await notchAction(page, 'confirm');
  await expect(page.getByText(/Sync complete/)).toBeVisible();

  await expect(card(page)).toHaveCount(0);
  expect(await calls(page)).toEqual([PREPARED, SHOWN, DISMISSED, EXECUTED]);
  expect(await workspace(page)).toContain(REMOTE_TASK);
});

test('cancelar pelo notch recusa a sincronização sem aplicar nada', async ({ page }) => {
  await openReview(page);
  await askConfirmation(page);

  await notchAction(page, 'cancel');
  await expect(page.getByText('Synchronization cancelled. No selected change was applied.')).toBeVisible();

  await expect(card(page)).toHaveCount(0);
  expect(await calls(page)).toEqual([PREPARED, SHOWN, DISMISSED]);
  const refused = await workspace(page);
  expect(refused).not.toContain(REMOTE_TASK);
  expect(refused).not.toContain('remoteRef');
});

// Quando nada precisa sair para o Notion, o painel monta uma confirmação própria, sem ação
// preparada. É o caso em que a barreira protege só o workspace local — e é o mais fácil de perder
// num refactor, porque não há escrita remota para justificar a pergunta.
test('uma mudança só local também espera a confirmação, e aprová-la não chama o executor remoto', async ({ page }) => {
  await openReview(page);

  const decisions = page.locator('.notion-sync-item select');
  for (let index = 0; index < await decisions.count(); index += 1) {
    const decision = decisions.nth(index);
    if (await decision.inputValue() === 'keep-local') await decision.selectOption('skip');
  }
  await askConfirmation(page);

  const pendingCalls = await calls(page);
  expect(pendingCalls).toHaveLength(1);
  expect(pendingCalls[0]).toMatch(/^show:notion-local-/);
  expect(await workspace(page)).not.toContain(REMOTE_TASK);

  await card(page).getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText(/Sync complete/)).toBeVisible();

  const requestId = pendingCalls[0].slice('show:'.length);
  expect(await calls(page)).toEqual([pendingCalls[0], `hide:${requestId}`]);
  expect(await workspace(page)).toContain(REMOTE_TASK);
});

// Uma prévia confirmada tarde mandava a versão antiga e marcava o par como sincronizado: a edição feita
// no Notion no meio do caminho era sobrescrita ou nunca chegava aqui.
test('uma página editada no Notion depois da prévia bloqueia a confirmação, sem aplicar nada', async ({ page }) => {
  await openReview(page);
  await askConfirmation(page);
  await page.evaluate(() => (window as unknown as { hibiE2E: HibiE2E }).hibiE2E.editRemotePage());

  await card(page).getByRole('button', { name: 'Confirm', exact: true }).click();

  await expect(page.getByText(/changed since the preview\. Nothing was applied/)).toBeVisible();
  expect(await calls(page)).toEqual([PREPARED, SHOWN, DISMISSED]);
  const refused = await workspace(page);
  expect(refused).not.toContain(REMOTE_TASK);
  expect(refused).not.toContain('remoteRef');
  // A prévia velha sai da tela: revisar de novo é o único caminho.
  await expect(page.getByRole('heading', { name: 'Review changes' })).toHaveCount(0);
});

test('sem conseguir reler o Notion na confirmação, nada é aplicado', async ({ page }) => {
  await openReview(page);
  await askConfirmation(page);
  await page.evaluate(() => (window as unknown as { hibiE2E: HibiE2E }).hibiE2E.breakReads());

  await card(page).getByRole('button', { name: 'Confirm', exact: true }).click();

  await expect(page.getByText('Notion is unreachable.')).toBeVisible();
  expect(await calls(page)).toEqual([PREPARED, SHOWN, DISMISSED]);
  expect(await workspace(page)).not.toContain(REMOTE_TASK);
});

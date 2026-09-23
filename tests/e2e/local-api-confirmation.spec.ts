import { test, expect, type Page } from '@playwright/test';

type LocalApiIntent = Readonly<{ confirmationId: string; kind: string; payload: Record<string, unknown> }>;
type CompanionAction = Readonly<{ requestId: string; actionId: 'confirm' | 'cancel' }>;
type HibiE2E = {
  calls: string[];
  requestConfirmation: (intent: LocalApiIntent) => void;
  companionAction: (input: CompanionAction) => void;
};

// O e2e roda no build web, onde `window.hibiDesktop` não existe: sem dublê o App nunca recebe a
// confirmação e o cartão nunca aparece. Mesma ponte mínima de assistant-integration-action.spec.ts,
// reduzida ao notch e ao par confirmação/resolução da API local.
//
// O dublê guarda UM log ordenado em vez de contadores soltos: a ordem entre descartar a apresentação
// (`hideNotch`) e liberar a escrita (`resolveLocalApiWrite`) é parte do contrato — sem o descarte, o
// estado do companion segura a confirmação por 60 s e o relógio a mostra de novo no notch, já
// respondida. Com o log, cada teste verifica identidade, resposta e ordem numa asserção só.
async function installLocalApiBridge(page: Page) {
  await page.addInitScript(() => {
    const calls: string[] = [];
    // `ipcRenderer.on` aceita vários ouvintes ao mesmo tempo, e o App conta com isso: o efeito de
    // `onCompanionAction` reassina a cada mudança de `pendingLocalApiIntent`. O dublê guarda a lista
    // e devolve o cancelamento certo — com um ouvinte só, a ação do notch cairia num closure velho.
    const confirmationListeners: ((intent: LocalApiIntent) => void)[] = [];
    const companionActionListeners: ((action: CompanionAction) => void)[] = [];
    const subscribe = <T>(listeners: T[], callback: T) => {
      listeners.push(callback);
      return () => { const index = listeners.indexOf(callback); if (index >= 0) listeners.splice(index, 1); };
    };
    const e2e: HibiE2E = {
      calls,
      requestConfirmation: (intent) => confirmationListeners.forEach((listener) => listener(intent)),
      companionAction: (input) => companionActionListeners.forEach((listener) => listener(input)),
    };
    (window as unknown as { hibiE2E: HibiE2E }).hibiE2E = e2e;
    (window as unknown as { hibiDesktop: Record<string, unknown> }).hibiDesktop = {
      info: async () => ({ name: 'Hibi', version: '0.1.0', localOnly: true }),
      showNotch: async (presentation: { requestId: string }) => { calls.push(`show:${presentation.requestId}`); return { degraded: false, requestId: presentation.requestId }; },
      hideNotch: async (requestId: string) => { calls.push(`hide:${requestId}`); return true; },
      onLocalApiConfirmation: (callback: (intent: LocalApiIntent) => void) => subscribe(confirmationListeners, callback),
      onCompanionAction: (callback: (action: CompanionAction) => void) => subscribe(companionActionListeners, callback),
      resolveLocalApiWrite: async (input: { confirmationId: string; approved: boolean }) => {
        calls.push(`resolve:${input.confirmationId}:${input.approved}`);
        // O processo principal recusa o pedido que passou do prazo (hibi:local-api:resolve-write).
        if ((window as unknown as { hibiE2EExpired?: boolean }).hibiE2EExpired) return { resolved: false, expired: true };
        return { resolved: true, approved: input.approved };
      },
    };
  });
}

const CONFIRMATION_ID = 'local-api-write-1';
const TITLE = 'Revisar proposta da API';
const INTENT: LocalApiIntent = { confirmationId: CONFIRMATION_ID, kind: 'task.create', payload: { title: TITLE } };
const SHOWN = `show:${CONFIRMATION_ID}`;
const DISMISSED = `hide:${CONFIRMATION_ID}`;

const card = (page: Page) => page.getByRole('alert').filter({ hasText: 'Confirmação da API local' });
// A tarefa criada só existe na lista com o botão de concluir; o cartão não tem nenhum botão assim,
// então este seletor nunca confunde a pergunta com a resposta.
const taskRow = (page: Page) => page.getByRole('button', { name: `Concluir tarefa ${TITLE}` });
// Só o que esta confirmação provocou: outra apresentação do companion no meio do caminho não muda
// o que está sendo verificado aqui.
const callsForIntent = (page: Page) => page.evaluate((id) => (window as unknown as { hibiE2E: HibiE2E }).hibiE2E.calls.filter((call) => call.includes(id)), CONFIRMATION_ID);
const requestWrite = (page: Page) => page.evaluate((intent) => (window as unknown as { hibiE2E: HibiE2E }).hibiE2E.requestConfirmation(intent), INTENT);
const notchAction = (page: Page, actionId: 'confirm' | 'cancel', requestId = CONFIRMATION_ID) =>
  page.evaluate((input) => (window as unknown as { hibiE2E: HibiE2E }).hibiE2E.companionAction(input), { requestId, actionId });
// Sumir da lista não basta como prova de que nada foi aplicado: isto lê o workspace que o App
// persiste a cada mudança de dados, que é o que sobrevive ao recarregar.
const workspaceMentionsTask = (page: Page) => page.evaluate((title) => (window.localStorage.getItem('hibi-study-data') ?? '').includes(title), TITLE);

async function openTasks(page: Page) {
  await installLocalApiBridge(page);
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Tarefas', exact: true }).click();
  await expect(taskRow(page)).toHaveCount(0);
}

test('a confirmação da API local vira um cartão e nada é escrito enquanto ele está aberto', async ({ page }) => {
  await openTasks(page);
  await requestWrite(page);

  await expect(card(page)).toBeVisible();
  await expect(card(page)).toContainText(`Deseja criar “${TITLE}”?`);

  // A garantia que o recurso inteiro promete: a escrita fica parada até a pessoa responder — nem o
  // processo principal é liberado, nem a tarefa aparece no workspace.
  expect(await callsForIntent(page)).toEqual([SHOWN]);
  await expect(taskRow(page)).toHaveCount(0);
  expect(await workspaceMentionsTask(page)).toBe(false);
});

test('confirmar no cartão descarta a apresentação, libera a escrita e cria a tarefa', async ({ page }) => {
  await openTasks(page);
  await requestWrite(page);

  await card(page).getByRole('button', { name: 'Confirmar' }).click();

  await expect(card(page)).toHaveCount(0);
  await expect.poll(() => callsForIntent(page)).toEqual([SHOWN, DISMISSED, `resolve:${CONFIRMATION_ID}:true`]);
  await expect(taskRow(page)).toHaveCount(1);
  expect(await workspaceMentionsTask(page)).toBe(true);
});

test('cancelar no cartão recusa a escrita e não deixa rastro no workspace', async ({ page }) => {
  await openTasks(page);
  await requestWrite(page);

  await card(page).getByRole('button', { name: 'Cancelar' }).click();

  await expect(card(page)).toHaveCount(0);
  await expect.poll(() => callsForIntent(page)).toEqual([SHOWN, DISMISSED, `resolve:${CONFIRMATION_ID}:false`]);
  await expect(taskRow(page)).toHaveCount(0);
  expect(await workspaceMentionsTask(page)).toBe(false);
});

test('responder pelo notch resolve a mesma escrita que os botões do cartão', async ({ page }) => {
  await openTasks(page);
  await requestWrite(page);
  await expect(card(page)).toBeVisible();

  // Uma ação de outra apresentação não pode responder por esta confirmação.
  await notchAction(page, 'confirm', 'outra-confirmacao');
  await expect(card(page)).toBeVisible();
  expect(await callsForIntent(page)).toEqual([SHOWN]);

  await notchAction(page, 'confirm');
  await expect(card(page)).toHaveCount(0);
  await expect.poll(() => callsForIntent(page)).toEqual([SHOWN, DISMISSED, `resolve:${CONFIRMATION_ID}:true`]);
  await expect(taskRow(page)).toHaveCount(1);
});

test('cancelar pelo notch recusa a escrita sem criar a tarefa', async ({ page }) => {
  await openTasks(page);
  await requestWrite(page);
  await expect(card(page)).toBeVisible();

  await notchAction(page, 'cancel');

  await expect(card(page)).toHaveCount(0);
  await expect.poll(() => callsForIntent(page)).toEqual([SHOWN, DISMISSED, `resolve:${CONFIRMATION_ID}:false`]);
  await expect(taskRow(page)).toHaveCount(0);
  expect(await workspaceMentionsTask(page)).toBe(false);
});

// Antes a tarefa era criada aqui e só depois o processo principal era avisado: um pedido já expirado lá
// virava tarefa do mesmo jeito.
test('aprovar um pedido que o processo principal já deu como expirado não cria nada', async ({ page }) => {
  await openTasks(page);
  await requestWrite(page);
  await page.evaluate(() => { (window as unknown as { hibiE2EExpired?: boolean }).hibiE2EExpired = true; });

  await card(page).getByRole('button', { name: 'Confirmar' }).click();

  await expect(page.getByRole('alert').filter({ hasText: 'A confirmação da API local expirou.' })).toBeVisible();
  await expect(taskRow(page)).toHaveCount(0);
  expect(await workspaceMentionsTask(page)).toBe(false);
});

test('o cartão da API local some quando o prazo do pedido acaba', async ({ page }) => {
  await page.clock.install();
  await openTasks(page);
  await requestWrite(page);
  await expect(card(page)).toBeVisible();

  await page.clock.runFor(61_000);

  await expect(card(page)).toHaveCount(0);
  expect(await workspaceMentionsTask(page)).toBe(false);
});

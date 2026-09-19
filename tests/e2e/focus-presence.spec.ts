import { test, expect, type Page } from '@playwright/test';

type PresenceEvent =
  | { type: 'away'; reason: 'idle' | 'power'; idleSeconds: number; atMs: number }
  | { type: 'returned'; reason: 'idle' | 'power'; awaySeconds: number; atMs: number };
type CompanionAction = Readonly<{ requestId: string; actionId: 'confirm' | 'cancel' }>;
type HibiE2E = {
  calls: string[];
  presence: (event: PresenceEvent) => void;
  companionAction: (action: CompanionAction) => void;
};

const SETTINGS_KEY = 'hibi-focus-settings';
const dock = (page: Page) => page.getByRole('navigation', { name: 'Navegação principal' });
const clockFace = (page: Page) => page.locator('.focus-ring span');
const prompt = (page: Page, title: string) => page.getByRole('alert').filter({ hasText: title });
const calls = (page: Page) => page.evaluate(() => (window as unknown as { hibiE2E: HibiE2E }).hibiE2E.calls);
// O carimbo sai do relógio da própria página, como o processo principal carimbaria no Mac.
const away = (page: Page, idleSeconds: number, reason: 'idle' | 'power' = 'idle') =>
  page.evaluate(({ idleSeconds, reason }) => (window as unknown as { hibiE2E: HibiE2E }).hibiE2E.presence({ type: 'away', reason, idleSeconds, atMs: Date.now() }), { idleSeconds, reason });
const returned = (page: Page, awaySeconds: number) =>
  page.evaluate((awaySeconds) => (window as unknown as { hibiE2E: HibiE2E }).hibiE2E.presence({ type: 'returned', reason: 'idle', awaySeconds, atMs: Date.now() }), awaySeconds);
const companionAction = (page: Page, prefix: string, actionId: 'confirm' | 'cancel') =>
  page.evaluate(({ prefix, actionId }) => {
    const e2e = (window as unknown as { hibiE2E: HibiE2E }).hibiE2E;
    const shown = e2e.calls.filter((call) => call.startsWith(`show:confirmation:${prefix}`)).at(-1);
    if (shown) e2e.companionAction({ requestId: shown.split(':')[2]!, actionId });
  }, { prefix, actionId });
// O App persiste a instrumentação em `hibi-events`: é dali que sai o que a tela registrou de fato.
const recordedActions = (page: Page) => page.evaluate(() => (JSON.parse(window.localStorage.getItem('hibi-events') ?? '[]') as { action: string }[]).map((event) => event.action));
const focusActivity = (page: Page) => page.evaluate(() => (JSON.parse(window.localStorage.getItem('hibi-study-data') ?? '{}').activity ?? []) as { type: string; durationMinutes?: number }[]);

// O e2e roda no build web, sem `window.hibiDesktop`. O dublê faz o papel do processo principal: guarda
// os pedidos de vigia e as apresentações do companion num log ordenado, e deixa o teste disparar
// ausência, retorno e respostas dadas no notch pelos mesmos callbacks que o preload entregaria.
async function installPresenceBridge(page: Page, settings?: Record<string, unknown>) {
  await page.addInitScript(({ key, settings }) => {
    // Semeia os ajustes só na primeira carga: recarregar precisa ler o que a própria tela gravou.
    if (settings && !window.sessionStorage.getItem('hibi-e2e-presence-seeded')) {
      window.localStorage.setItem(key, JSON.stringify(settings));
      window.sessionStorage.setItem('hibi-e2e-presence-seeded', '1');
    }
    const calls: string[] = [];
    const presenceListeners: ((event: unknown) => void)[] = [];
    const actionListeners: ((action: unknown) => void)[] = [];
    const subscribe = <T>(listeners: T[], callback: T) => {
      listeners.push(callback);
      return () => { const index = listeners.indexOf(callback); if (index >= 0) listeners.splice(index, 1); };
    };
    (window as unknown as { hibiE2E: unknown }).hibiE2E = {
      calls,
      presence: (event: unknown) => presenceListeners.forEach((listener) => listener(event)),
      companionAction: (action: unknown) => actionListeners.forEach((listener) => listener(action)),
    };
    (window as unknown as { hibiDesktop: Record<string, unknown> }).hibiDesktop = {
      info: async () => ({ name: 'Hibi', version: '0.1.0', localOnly: true }),
      showNotch: async (presentation: { requestId: string; kind: string }) => { calls.push(`show:${presentation.kind}:${presentation.requestId}`); return { degraded: false, requestId: presentation.requestId }; },
      hideNotch: async (requestId: string) => { calls.push(`hide:${requestId}`); return true; },
      watchFocusPresence: async (request: { watching: boolean; idleMinutes: number }) => { calls.push(`watch:${request.watching}:${request.idleMinutes}`); return { watching: request.watching }; },
      onFocusPresence: (callback: (event: unknown) => void) => subscribe(presenceListeners, callback),
      onCompanionAction: (callback: (action: unknown) => void) => subscribe(actionListeners, callback),
    };
  }, { key: SETTINGS_KEY, settings });
}

// Relógio parado antes de começar: cada minuto da sessão só passa quando o teste manda, então o mostrador
// pode ser lido ao segundo.
async function startFocusSession(page: Page, settings?: Record<string, unknown>) {
  await page.clock.install({ time: new Date(2026, 8, 10, 10, 0, 0) });
  await installPresenceBridge(page, settings);
  await page.goto('/');
  await expect(dock(page)).toBeVisible();
  await page.clock.pauseAt(new Date(2026, 8, 10, 10, 5, 0));
  await dock(page).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Foco', exact: true }).click();
  await page.getByRole('button', { name: 'Start focus' }).click();
  await expect(page.getByRole('button', { name: 'Pause session' })).toBeVisible();
}

async function openFocusSettings(page: Page) {
  await dock(page).getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('button', { name: 'Focus', exact: true }).click();
}

test('com "perguntar", a ausência durante o foco vira pergunta, e "Pausar" para o contador sem contar o tempo ausente', async ({ page }) => {
  await startFocusSession(page);
  await expect.poll(() => calls(page)).toContain('watch:true:5');
  await expect(page.locator('.companion-animation-video')).toHaveAttribute('src', /working_laptop_normal_loop\.mp4$/);

  await page.clock.runFor(6 * 60_000);
  await expect(clockFace(page)).toHaveText('19:00');
  await away(page, 300);

  const question = prompt(page, 'Você ainda está aí?');
  await expect(question).toBeVisible();
  await expect(question).toContainText('Ninguém mexe no Mac há 5 minutos.');
  await expect.poll(async () => (await calls(page)).some((call) => call.startsWith('show:confirmation:focus-idle-'))).toBe(true);

  // Sem resposta, a sessão segue como estava.
  await page.clock.runFor(60_000);
  await expect(clockFace(page)).toHaveText('18:00');

  await question.getByRole('button', { name: 'Pausar' }).click();
  await expect(question).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start focus' })).toBeVisible();
  // 7 minutos de relógio, 6 deles ausentes (5 parados antes da pergunta e 1 esperando a resposta): conta 1.
  await expect(clockFace(page)).toHaveText('24:00');
  await expect(page.getByRole('status').filter({ hasText: 'O tempo ausente não contou como foco' })).toBeVisible();
  await page.clock.runFor(3 * 60_000);
  await expect(clockFace(page)).toHaveText('24:00');
  // Quem respondeu "Pausar" está na frente do Mac: a vigia desliga e nenhuma oferta de retomar aparece.
  await expect.poll(() => calls(page)).toContain('watch:false:5');
  await expect.poll(async () => (await calls(page)).some((call) => call.startsWith('hide:focus-idle-'))).toBe(true);
  await expect(prompt(page, 'Você voltou')).toHaveCount(0);
});

test('com "perguntar", responder "Ainda estou aqui" pelo notch fecha a pergunta, a sessão segue contando e conclui', async ({ page }) => {
  await startFocusSession(page);
  await page.clock.runFor(6 * 60_000);
  await away(page, 300);
  await expect(prompt(page, 'Você ainda está aí?')).toBeVisible();

  await companionAction(page, 'focus-idle-', 'confirm');

  await expect(prompt(page, 'Você ainda está aí?')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pause session' })).toBeVisible();
  await page.clock.runFor(60_000);
  await expect(clockFace(page)).toHaveText('18:00');

  // Com a presença confirmada, a sessão chega ao zero inteira e conta como concluída, com a comemoração.
  await page.clock.runFor(18 * 60_000);
  await expect(page.getByRole('button', { name: 'Start focus' })).toBeVisible();
  await expect.poll(async () => (await calls(page)).some((call) => call.startsWith('show:result:focus-'))).toBe(true);
  await expect.poll(() => recordedActions(page)).toContain('focus-complete');
  await expect(page.getByRole('status').filter({ hasText: 'A sessão não contou como concluída' })).toHaveCount(0);
  expect((await focusActivity(page)).filter((record) => record.type === 'focus.completed').map((record) => record.durationMinutes)).toEqual([25]);
  expect((await focusActivity(page)).filter((record) => record.type === 'focus.cancelled')).toEqual([]);
});

// Trocar de tela não encerra mais a sessão: pausada, a ida para o descanso a abandona.
async function abandonSession(page: Page) {
  await page.getByRole('button', { name: 'Pause session' }).click();
  await page.getByRole('button', { name: 'Fazer uma pausa' }).click();
  await expect(page.getByRole('button', { name: 'Começar pausa' })).toBeVisible();
}

// O que o /stats mostra em "Hoje": o cartão "Tempo de foco" e a coluna de foco da tabela do dia.
async function openStatsToday(page: Page) {
  await dock(page).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Estatísticas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Estatísticas', level: 1 })).toBeVisible();
  const today = page.getByRole('group', { name: 'Período', exact: true }).getByRole('button', { name: 'Hoje', exact: true });
  await today.click();
  await expect(today).toHaveAttribute('aria-pressed', 'true');
  const focusCard = page.getByRole('region', { name: 'Resumo', exact: true }).getByRole('listitem').filter({ has: page.getByText('Tempo de foco', { exact: true }) });
  // Na tabela de "Hoje" as células são: tarefas, foco, planejado, concluído.
  const focusCell = page.getByRole('table', { name: /^Valores por dia, / }).getByRole('row').nth(1).getByRole('cell').nth(1);
  return { focusCard, focusCell };
}

// Quem se afastou de verdade não responde. Na volta, "Ainda estou aqui" contaria os minutos fora como foco:
// a pergunta muda para "Esse tempo foi foco?", e "Descontar" devolve o tempo sem pausar a sessão.
test('com "perguntar", a volta muda a pergunta, e "Descontar" tira o tempo ausente sem pausar', async ({ page }) => {
  await startFocusSession(page, { sessionMinutes: 50 });
  await page.clock.runFor(6 * 60_000);
  await away(page, 300);
  const question = prompt(page, 'Você ainda está aí?');
  await expect(question).toBeVisible();
  // Esperando a volta, o companion trabalha entediado.
  await expect(page.locator('.companion-animation-video')).toHaveAttribute('src', /working_laptop_bored_loop\.mp4$/);

  // 20 minutos de relógio sem resposta; a sessão segue contando até a volta.
  await page.clock.runFor(20 * 60_000);
  await expect(clockFace(page)).toHaveText('24:00');
  await returned(page, 25 * 60);

  const review = prompt(page, 'Esse tempo foi foco?');
  await expect(review).toBeVisible();
  // Os 5 minutos parados antes da pergunta e os 20 esperando a resposta.
  await expect(review).toContainText('Você ficou 25 minutos sem mexer no Mac. Esse tempo foi foco?');
  await expect(question).toHaveCount(0);
  // A pessoa voltou: o companion deixa de esperar.
  await expect(page.locator('.companion-animation-video')).toHaveAttribute('src', /working_laptop_normal_loop\.mp4$/);
  // No companion: a pergunta anterior é descartada e a nova aparece no lugar.
  await expect.poll(async () => (await calls(page)).some((call) => call.startsWith('hide:focus-idle-'))).toBe(true);
  await expect.poll(async () => (await calls(page)).some((call) => call.startsWith('show:confirmation:focus-returned-'))).toBe(true);

  await review.getByRole('button', { name: 'Descontar' }).click();
  await expect(review).toHaveCount(0);
  // A sessão continua rodando, e o mostrador devolve os 25 minutos: só 1 minuto presente foi medido.
  await expect(page.getByRole('button', { name: 'Pause session' })).toBeVisible();
  await expect(clockFace(page)).toHaveText('49:00');
  await page.clock.runFor(60_000);
  await expect(clockFace(page)).toHaveText('48:00');
  await expect.poll(async () => (await calls(page)).some((call) => call.startsWith('hide:focus-returned-'))).toBe(true);

  // Encerrar a sessão (pausar e ir para o descanso) abandona com 2 minutos presentes, não os 27 do
  // relógio de parede.
  await abandonSession(page);
  const { focusCard, focusCell } = await openStatsToday(page);
  await expect(focusCell).toHaveText('2');
  await expect(focusCard.locator('.stats-card-value')).toHaveText('2 min');
  expect((await focusActivity(page)).filter((record) => record.type === 'focus.cancelled').map((record) => record.durationMinutes)).toEqual([2]);
});

// Uma sessão só conta como concluída com presença confirmada em pelo menos metade da duração.
test('com "perguntar", a pergunta sem resposta até o fim da sessão não conta o tempo ausente nem a sessão como concluída', async ({ page }) => {
  await startFocusSession(page);
  await page.clock.runFor(6 * 60_000);
  await away(page, 300);
  await expect(prompt(page, 'Você ainda está aí?')).toBeVisible();

  // Ninguém volta: o contador chega a zero com a pergunta aberta, 20 minutos de relógio depois dela.
  await page.clock.runFor(19 * 60_000);
  await expect(page.getByRole('button', { name: 'Start focus' })).toBeVisible();
  await expect(prompt(page, 'Você ainda está aí?')).toHaveCount(0);

  // A sessão não some calada: a tela diz por que ela não contou.
  await expect(page.getByRole('status').filter({ hasText: 'A sessão não contou como concluída: você esteve presente em 1 minuto de 25 minutos.' })).toBeVisible();
  // Sem comemoração no companion e sem focus-complete; o que fica registrado é o cancelamento.
  await expect.poll(() => recordedActions(page)).toContain('focus-cancel');
  expect(await recordedActions(page)).not.toContain('focus-complete');
  expect((await calls(page)).filter((call) => call.startsWith('show:result:'))).toEqual([]);

  // Dos 25 minutos da sessão, só o primeiro teve alguém na frente do Mac: o minuto soma, a sessão não.
  const { focusCard, focusCell } = await openStatsToday(page);
  await expect(focusCell).toHaveText('1');
  await expect(focusCard.locator('.stats-card-value')).toHaveText('1 min');
  await expect(focusCard).toContainText('Sessões concluídas: 0');
  expect((await focusActivity(page)).filter((record) => record.type === 'focus.cancelled').map((record) => record.durationMinutes)).toEqual([1]);
  expect((await focusActivity(page)).filter((record) => record.type === 'focus.completed')).toEqual([]);
});

test('com "perguntar", "Contar" depois da volta mantém o tempo ausente como foco', async ({ page }) => {
  await startFocusSession(page, { sessionMinutes: 50 });
  await page.clock.runFor(6 * 60_000);
  await away(page, 300);
  await page.clock.runFor(4 * 60_000);
  await returned(page, 9 * 60);

  const review = prompt(page, 'Esse tempo foi foco?');
  await expect(review).toContainText('Você ficou 9 minutos sem mexer no Mac.');
  await companionAction(page, 'focus-returned-', 'confirm');

  await expect(review).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pause session' })).toBeVisible();
  await expect(clockFace(page)).toHaveText('40:00');
});

test('com "pausar", a ausência pausa sozinha sem contar o tempo ausente, e a volta oferece retomar', async ({ page }) => {
  await startFocusSession(page, { awayBehavior: 'pause', idleMinutes: 2 });
  await expect.poll(() => calls(page)).toContain('watch:true:2');

  await page.clock.runFor(6 * 60_000);
  await away(page, 120);

  // Pausou sozinha: nenhuma pergunta, e os 2 minutos ausentes voltaram ao mostrador.
  await expect(page.getByRole('button', { name: 'Start focus' })).toBeVisible();
  await expect(prompt(page, 'Você ainda está aí?')).toHaveCount(0);
  await expect(clockFace(page)).toHaveText('21:00');
  await expect(page.getByRole('status').filter({ hasText: 'Sessão pausada porque você se afastou' })).toBeVisible();
  await page.clock.runFor(5 * 60_000);
  await expect(clockFace(page)).toHaveText('21:00');
  // Pausada por ausência, continua vigiando para perceber a volta.
  expect(await calls(page)).not.toContain('watch:false:2');

  await returned(page, 420);
  const offer = prompt(page, 'Você voltou. Retomar a sessão?');
  await expect(offer).toBeVisible();
  await expect.poll(async () => (await calls(page)).some((call) => call.startsWith('show:confirmation:focus-resume-'))).toBe(true);
  await expect.poll(() => calls(page)).toContain('watch:false:2');

  await offer.getByRole('button', { name: 'Retomar' }).click();
  await expect(offer).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pause session' })).toBeVisible();
  await page.clock.runFor(60_000);
  await expect(clockFace(page)).toHaveText('20:00');

  // O que o /stats soma: encerrada, a sessão é abandonada com os minutos presentes — 4 antes de sair
  // e 1 depois de retomar —, não os 12 do relógio de parede.
  await abandonSession(page);
  await expect.poll(async () => (await focusActivity(page)).filter((record) => record.type === 'focus.cancelled').map((record) => record.durationMinutes)).toEqual([5]);
});

test('na pausa de descanso a ausência não muda nada', async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 8, 10, 10, 0, 0) });
  await installPresenceBridge(page, { awayBehavior: 'pause' });
  await page.goto('/');
  await page.clock.pauseAt(new Date(2026, 8, 10, 10, 5, 0));
  await dock(page).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Foco', exact: true }).click();
  await page.getByRole('button', { name: 'Fazer uma pausa' }).click();
  await page.getByRole('button', { name: 'Começar pausa' }).click();
  await page.clock.runFor(2 * 60_000);

  await away(page, 120);

  await expect(page.getByRole('button', { name: 'Encerrar pausa' })).toBeVisible();
  await expect(clockFace(page)).toHaveText('03:00');
  expect((await calls(page)).filter((call) => call.startsWith('watch:'))).toEqual([]);
});

test('os ajustes de presença sobrevivem a recarregar, e o loop escolhido toca durante o foco', async ({ page }) => {
  await installPresenceBridge(page);
  await page.goto('/');
  await openFocusSettings(page);

  await page.getByLabel('Quando você se afastar').selectOption('pause');
  await page.getByLabel('Tempo de inatividade').selectOption('10');
  await page.getByLabel('Animação durante o foco').selectOption('music');
  await page.getByLabel('Timeout de tela do Taby').selectOption('300');
  await expect(page.getByText('Só vale com o dispositivo Taby conectado.')).toBeVisible();
  await expect(page.getByText('Taby não conectado')).toBeVisible();

  await page.reload();
  await openFocusSettings(page);
  await expect(page.getByLabel('Quando você se afastar')).toHaveValue('pause');
  await expect(page.getByLabel('Tempo de inatividade')).toHaveValue('10');
  await expect(page.getByLabel('Animação durante o foco')).toHaveValue('music');
  await expect(page.getByLabel('Timeout de tela do Taby')).toHaveValue('300');

  // "Continuar contando" desliga o tempo de inatividade, que não governaria nada.
  await page.getByLabel('Quando você se afastar').selectOption('keep');
  await expect(page.getByLabel('Tempo de inatividade')).toBeDisabled();
  await page.getByLabel('Quando você se afastar').selectOption('pause');

  await dock(page).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Foco', exact: true }).click();
  await page.getByRole('button', { name: 'Start focus' }).click();
  await expect(page.locator('.companion-animation-video')).toHaveAttribute('src', /listening_music_loop\.mp4$/);
  await expect.poll(() => calls(page)).toContain('watch:true:10');
});

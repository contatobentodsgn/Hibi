import { test, expect, type Page } from '@playwright/test';

type Log = { calls: string[]; say: (text: string) => void; finish: (ended: string) => void; shortcut: (request: { listen: boolean; background: boolean }) => void };
// O dublê da voz: `say` entrega texto como o helper, `finish` encerra a escuta com o motivo que o
// processo principal daria (a pausa, ninguém falou, parado pela tela).
async function installVoice(page: Page, settings = { shortcutVoice: 'off', spokenReplies: true }) {
  await page.addInitScript((initial) => {
    const calls: string[] = [];
    const textListeners: ((text: string) => void)[] = [];
    const shortcutListeners: ((request: { listen: boolean; background: boolean }) => void)[] = [];
    let finishListen: ((result: unknown) => void) | null = null;
    let voiceSettings = { ...initial };
    const log: Log = {
      calls,
      say: (text) => textListeners.forEach((listener) => listener(text)),
      finish: (ended) => { finishListen?.({ status: 'ready', locale: 'pt-BR', error: null, reason: null, ended }); finishListen = null; },
      shortcut: (request) => shortcutListeners.forEach((listener) => listener(request)),
    };
    (window as unknown as { voiceE2E: Log }).voiceE2E = log;
    (window as unknown as { hibiDesktop: Record<string, unknown> }).hibiDesktop = {
      listenLocalVoice: (options: { autoStop?: boolean; vocabulary?: string[] }) => { calls.push(`listen:${options?.autoStop === true}`); calls.push(`vocabulary:${JSON.stringify(options?.vocabulary ?? [])}`); return new Promise((resolve) => { finishListen = resolve; }); },
      stopLocalVoice: async () => { calls.push('stop'); log.finish('stopped'); return { status: 'ready' }; },
      onLocalVoiceText: (callback: (text: string) => void) => { textListeners.push(callback); return () => textListeners.splice(textListeners.indexOf(callback), 1); },
      speakLocalVoice: async (text: string) => { calls.push(`speak:${text}`); return { status: 'ready', spoken: true }; },
      onTabyShortcut: (callback: (request: { listen: boolean; background: boolean }) => void) => { shortcutListeners.push(callback); return () => shortcutListeners.splice(shortcutListeners.indexOf(callback), 1); },
      getTabyShortcut: async () => ({ accelerator: 'Command+Shift+Space', status: 'active' }),
      setTabyShortcut: async (accelerator: string | null) => ({ accelerator, status: 'active' }),
      getVoiceSettings: async () => ({ ...voiceSettings }),
      setVoiceSettings: async (patch: Record<string, unknown>) => { calls.push(`settings:${JSON.stringify(patch)}`); voiceSettings = { ...voiceSettings, ...patch }; return { ...voiceSettings }; },
      showNotch: async (presentation: { requestId: string; kind: string; text: string | null }) => { calls.push(`notch:${presentation.kind}:${presentation.text ?? ''}`); return { degraded: false, requestId: presentation.requestId }; },
      hideNotch: async () => true,
    };
  }, settings);
}
const voice = (page: Page) => ({
  calls: () => page.evaluate(() => (window as unknown as { voiceE2E: Log }).voiceE2E.calls),
  say: (text: string) => page.evaluate((value) => (window as unknown as { voiceE2E: Log }).voiceE2E.say(value), text),
  finish: (ended: string) => page.evaluate((value) => (window as unknown as { voiceE2E: Log }).voiceE2E.finish(value), ended),
  shortcut: (request: { listen: boolean; background: boolean }) => page.evaluate((value) => (window as unknown as { voiceE2E: Log }).voiceE2E.shortcut(value), request),
});
const campo = (page: Page) => page.getByRole('textbox', { name: 'Pergunte ou peça uma ação' });
const openTaby = async (page: Page) => { await page.goto('/'); await page.getByRole('button', { name: 'Taby', exact: true }).click(); };

test('falar e parar de falar envia o pedido sozinho, sem apertar Enviar', async ({ page }) => {
  await installVoice(page);
  await openTaby(page);
  await page.getByRole('button', { name: 'Falar' }).click();
  expect(await voice(page).calls()).toContain('listen:true');

  await voice(page).say('crie uma tarefa revisar contrato');
  await expect(campo(page)).toHaveValue('crie uma tarefa revisar contrato');
  await voice(page).finish('silence');

  // O pedido virou turno: o cartão de confirmação da tarefa aparece, e o campo esvazia.
  await expect(page.getByRole('alert').filter({ hasText: 'Confirme' })).toBeVisible();
  await expect(campo(page)).toHaveValue('');
});

test('a escuta leva ao reconhecedor os nomes que já estão no Hibi', async ({ page }) => {
  await installVoice(page);
  await openTaby(page);
  await page.getByRole('button', { name: 'Falar' }).click();

  const pedido = (await voice(page).calls()).find((call) => call.startsWith('vocabulary:')) ?? 'vocabulary:[]';
  const termos = JSON.parse(pedido.slice('vocabulary:'.length)) as string[];
  // Os dados de exemplo têm "Kabrito Post 01…06" e a pasta "Bento".
  expect(termos).toEqual(expect.arrayContaining(['Bento', 'Kabrito', 'Kabrito Post 01']));
  expect(termos.length).toBeLessThanOrEqual(100);
});

test('parar pelo botão deixa o texto no campo para editar, sem enviar', async ({ page }) => {
  await installVoice(page);
  await openTaby(page);
  await page.getByRole('button', { name: 'Falar' }).click();
  await voice(page).say('crie uma tarefa rascunho');
  await page.getByRole('button', { name: 'Parar voz' }).click();

  await expect(page.getByRole('button', { name: 'Falar' })).toBeVisible();
  await expect(campo(page)).toHaveValue('crie uma tarefa rascunho');
  await expect(page.getByRole('alert').filter({ hasText: 'Confirme' })).toHaveCount(0);
});

test('sem nenhuma palavra, a tela diz que não ouviu nada', async ({ page }) => {
  await installVoice(page);
  await openTaby(page);
  await page.getByRole('button', { name: 'Falar' }).click();
  await voice(page).finish('no-speech');
  await expect(page.getByText('Não ouvi nada. Aperte Falar e diga o pedido.')).toBeVisible();
});

test('a resposta de um pedido falado é lida em voz alta; a de um pedido digitado, não', async ({ page }) => {
  await installVoice(page);
  await openTaby(page);
  await campo(page).fill('quais são minhas tarefas?');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled();
  await page.waitForTimeout(300);
  expect((await voice(page).calls()).filter((call) => call.startsWith('speak:'))).toEqual([]);

  await page.getByRole('button', { name: 'Falar' }).click();
  await voice(page).say('quais são minhas tarefas?');
  await voice(page).finish('silence');
  await expect.poll(async () => (await voice(page).calls()).filter((call) => call.startsWith('speak:')).length).toBe(1);
});

test('pelo atalho no modo notch, o notch mostra o que é ouvido, sem trocar de tela', async ({ page }) => {
  await installVoice(page, { shortcutVoice: 'notch', spokenReplies: false });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  const telaAntes = await page.getByRole('heading', { level: 1 }).first().textContent();

  await voice(page).shortcut({ listen: true, background: true });
  // Sem texto ainda: a barra mostra "Ouvindo…" como dica; o ditado toma o lugar dela.
  await expect.poll(() => voice(page).calls()).toContain('notch:listening:');
  await voice(page).say('crie uma tarefa ligar para a escola');
  await expect.poll(() => voice(page).calls()).toContain('notch:listening:crie uma tarefa ligar para a escola');
  await voice(page).finish('silence');

  // O pedido segue como qualquer outro: a confirmação chega ao notch.
  await expect.poll(async () => (await voice(page).calls()).some((call) => call.startsWith('notch:confirmation:'))).toBe(true);
  expect(await page.getByRole('heading', { level: 1 }).first().textContent()).toBe(telaAntes);
});

test('pelo atalho no modo janela, o Taby abre já ouvindo', async ({ page }) => {
  await installVoice(page, { shortcutVoice: 'window', spokenReplies: false });
  await page.goto('/');
  await voice(page).shortcut({ listen: true, background: false });
  await expect(page.getByRole('button', { name: 'Parar voz' })).toBeVisible();
  await expect(campo(page)).toBeVisible();
});

test('os ajustes de voz ficam em Configurações, junto do atalho', async ({ page }) => {
  await installVoice(page, { shortcutVoice: 'off', spokenReplies: false });
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Ajustes', exact: true }).click();

  await page.getByLabel('Voz pelo atalho').selectOption('notch');
  await page.getByLabel('Ler em voz alta as respostas de pedidos feitos por voz').check();

  expect(await voice(page).calls()).toEqual(expect.arrayContaining(['settings:{"shortcutVoice":"notch"}', 'settings:{"spokenReplies":true}']));
});

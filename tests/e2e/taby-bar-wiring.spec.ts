import { test, expect, type Page } from '@playwright/test';

type Log = { calls: string[]; submit: (text: string) => void; voice: (command: string) => void; closed: (requestId: string) => void; say: (text: string) => void; finish: (ended: string) => void };
// A janela principal com um dublê da ponte: o processo principal repassa a ela o que a barra fez
// (enviar, falar, fechar), e ela conversa com o notch pelo `showNotch`/`hideNotch` de sempre.
async function installBridge(page: Page) {
  await page.addInitScript(() => {
    const calls: string[] = [];
    const listeners: Record<string, ((value: string) => void)[]> = { submit: [], voice: [], closed: [], text: [] };
    let finishListen: ((result: unknown) => void) | null = null;
    const on = (name: string) => (callback: (value: string) => void) => { listeners[name]!.push(callback); return () => listeners[name]!.splice(listeners[name]!.indexOf(callback), 1); };
    const log: Log = {
      calls,
      submit: (text) => listeners.submit!.forEach((listener) => listener(text)),
      voice: (command) => listeners.voice!.forEach((listener) => listener(command)),
      closed: (requestId) => listeners.closed!.forEach((listener) => listener(requestId)),
      say: (text) => listeners.text!.forEach((listener) => listener(text)),
      finish: (ended) => { finishListen?.({ status: 'ready', locale: 'pt-BR', error: null, reason: null, ended }); finishListen = null; },
    };
    (window as unknown as { wiringE2E: Log }).wiringE2E = log;
    (window as unknown as { hibiDesktop: Record<string, unknown> }).hibiDesktop = {
      onBarSubmit: on('submit'), onBarVoice: on('voice'), onBarClosed: on('closed'), onLocalVoiceText: on('text'),
      listenLocalVoice: () => { calls.push('listen'); return new Promise((resolve) => { finishListen = resolve; }); },
      stopLocalVoice: async () => { calls.push('stop'); log.finish('stopped'); return { status: 'ready' }; },
      showNotch: async (presentation: { requestId: string; kind: string }) => { calls.push(`show:${presentation.kind}:${presentation.requestId.split('-')[0]}`); return { degraded: false, requestId: presentation.requestId }; },
      hideNotch: async (requestId: string) => { calls.push(`hide:${requestId.split('-')[0]}`); return true; },
    };
  });
  await page.goto('/');
}
const e2e = (page: Page) => ({
  calls: () => page.evaluate(() => (window as unknown as { wiringE2E: Log }).wiringE2E.calls),
  run: (name: 'submit' | 'voice' | 'closed' | 'say' | 'finish', value: string) => page.evaluate(([method, arg]) => (window as unknown as { wiringE2E: Record<string, (value: string) => void> }).wiringE2E[method]!(arg), [name, value] as const),
});

test('o texto enviado pela barra vira pedido ao Taby, e o notch passa a pensar', async ({ page }) => {
  await installBridge(page);
  await e2e(page).run('submit', 'crie uma tarefa revisar contrato');
  // O pedido chegou ao turno: primeiro o "pensando", depois a confirmação da tarefa.
  await expect.poll(async () => (await e2e(page).calls()).find((call) => call.startsWith('show:thinking'))).toBeTruthy();
  await expect.poll(async () => (await e2e(page).calls()).some((call) => call.startsWith('show:confirmation'))).toBe(true);
});

test('o botão de falar da barra abre a voz no notch, e o pedido sai sem passar pelo repouso', async ({ page }) => {
  await installBridge(page);
  await e2e(page).run('voice', 'start');
  await expect.poll(() => e2e(page).calls()).toContain('listen');
  await e2e(page).run('say', 'quais são minhas tarefas?');
  await e2e(page).run('finish', 'silence');

  await expect.poll(async () => (await e2e(page).calls()).some((call) => call.startsWith('show:thinking'))).toBe(true);
  const log = await e2e(page).calls();
  const depoisDeOuvir = log.slice(log.findIndex((call) => call === 'show:listening:voice'));
  // Entre ouvir e pensar não há esconder: o mascote e a barra trocam de estado no lugar, sem piscar.
  const ateOPensar = depoisDeOuvir.slice(0, depoisDeOuvir.findIndex((call) => call.startsWith('show:thinking')));
  expect(ateOPensar.some((call) => call.startsWith('hide:'))).toBe(false);
});

test('fechar a barra enquanto ouve para a escuta', async ({ page }) => {
  await installBridge(page);
  await e2e(page).run('voice', 'start');
  await expect.poll(() => e2e(page).calls()).toContain('listen');
  await e2e(page).run('closed', 'voice-qualquer');
  await expect.poll(() => e2e(page).calls()).toContain('stop');
});

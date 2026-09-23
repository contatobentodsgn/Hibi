import { test, expect, type Page } from '@playwright/test';

type Content = { requestId: string; mode: string; kind: string; text: string | null; actions: { id: string; label: string }[] };
type BarLog = { calls: string[]; push: (content: Content | null) => void };
// A barra roda sozinha, na rota da janela dela, com um dublê da ponte `hibiBar`: `push` faz o papel do
// processo principal mandando conteúdo, e `calls` guarda o que a barra devolveu.
async function openBar(page: Page, initial: Content | null) {
  await page.addInitScript((first) => {
    const calls: string[] = [];
    const listeners: ((content: unknown) => void)[] = [];
    const log: BarLog = { calls, push: (content) => listeners.forEach((listener) => listener(content)) };
    (window as unknown as { barE2E: BarLog }).barE2E = log;
    (window as unknown as { hibiBar: Record<string, unknown> }).hibiBar = {
      current: async () => first,
      submit: async (text: string) => { calls.push(`submit:${text}`); return true; },
      voice: async (command: string) => { calls.push(`voice:${command}`); return true; },
      action: async (requestId: string, actionId: string) => { calls.push(`action:${requestId}:${actionId}`); return true; },
      close: async () => { calls.push('close'); return true; },
      onContent: (callback: (content: unknown) => void) => { listeners.push(callback); return () => listeners.splice(listeners.indexOf(callback), 1); },
    };
  }, initial);
  await page.goto('/?overlay=bar');
}
const calls = (page: Page) => page.evaluate(() => (window as unknown as { barE2E: BarLog }).barE2E.calls);
const push = (page: Page, content: Content | null) => page.evaluate((value) => (window as unknown as { barE2E: BarLog }).barE2E.push(value), content);
const bar = (page: Page) => page.getByRole('main', { name: 'Barra do assistente' });
const input: Content = { requestId: 'taby-bar-input', mode: 'input', kind: 'input', text: null, actions: [] };

test('aberta pelo atalho, a barra recebe o texto; o botão troca de falar para enviar quando há texto', async ({ page }) => {
  await openBar(page, input);
  const campo = page.getByRole('textbox', { name: 'Pergunte ao assistente ou peça uma ação' });
  await expect(campo).toBeFocused();
  await expect(bar(page).getByRole('button', { name: 'Falar' })).toBeVisible();

  await campo.fill('crie uma tarefa revisar contrato');
  await expect(bar(page).getByRole('button', { name: 'Falar' })).toHaveCount(0);
  await campo.press('Enter');

  expect(await calls(page)).toEqual(['submit:crie uma tarefa revisar contrato']);
});

test('falar pela barra: o ditado aparece nela, e parar vai para a voz', async ({ page }) => {
  await openBar(page, input);
  await bar(page).getByRole('button', { name: 'Falar' }).click();
  expect(await calls(page)).toEqual(['voice:start']);

  await push(page, { requestId: 'voice-1', mode: 'listening', kind: 'listening', text: null, actions: [] });
  await expect(bar(page)).toContainText('Ouvindo…');
  await push(page, { requestId: 'voice-1', mode: 'listening', kind: 'listening', text: 'crie uma tarefa', actions: [] });
  await expect(bar(page)).toContainText('crie uma tarefa');
  // Um ditado longo mostra as últimas palavras, que é o que acabou de ser dito.
  await push(page, { requestId: 'voice-1', mode: 'listening', kind: 'listening', text: 'marque uma reunião com a Ana e o Pedro amanhã às quatro da tarde', actions: [] });
  await expect(bar(page)).toContainText('quatro da tarde');
  await expect(bar(page)).toContainText('…');
  await expect(bar(page)).not.toContainText('marque uma');
  await bar(page).getByRole('button', { name: 'Parar de ouvir' }).click();
  expect(await calls(page)).toContain('voice:stop');
});

test('enquanto o Taby pensa, o pedido continua na barra; a resposta toma o lugar dele', async ({ page }) => {
  await openBar(page, input);
  await page.getByRole('textbox', { name: 'Pergunte ao assistente ou peça uma ação' }).fill('quais são minhas tarefas?');
  await page.keyboard.press('Enter');
  await push(page, { requestId: 'turn-1', mode: 'thinking', kind: 'thinking', text: 'quais são minhas tarefas?', actions: [] });
  await expect(bar(page)).toContainText('quais são minhas tarefas?');

  await push(page, { requestId: 'turn-1', mode: 'reply', kind: 'result', text: 'Você tem 3 tarefas abertas.', actions: [] });
  await expect(bar(page)).toContainText('Você tem 3 tarefas abertas.');
  await bar(page).getByRole('button', { name: 'Fechar' }).click();
  expect(await calls(page)).toContain('close');
});

test('uma confirmação fica na barra com os botões dela, e Esc cancela em vez de fechar', async ({ page }) => {
  const confirmacao: Content = { requestId: 'c-1', mode: 'confirmation', kind: 'confirmation', text: 'Criar a tarefa "revisar contrato"?', actions: [{ id: 'confirm', label: 'Confirmar' }, { id: 'cancel', label: 'Cancelar' }] };
  await openBar(page, confirmacao);
  const dialogo = page.getByRole('dialog', { name: 'Barra do assistente' });
  await expect(dialogo).toContainText('Criar a tarefa');
  await page.keyboard.press('Escape');
  expect(await calls(page)).toEqual(['action:c-1:cancel']);

  await dialogo.getByRole('button', { name: 'Confirmar' }).click();
  expect(await calls(page)).toEqual(['action:c-1:cancel', 'action:c-1:confirm']);
});

test('um Esc no instante em que a confirmação aparece cancela, não fecha', async ({ page }) => {
  // O observador dispara o Esc assim que a confirmação entra na página: depois do desenho e antes dos efeitos
  // que o React roda em seguida. Foi nessa janela que a CI pegou a barra fechando em vez de cancelar.
  await page.addInitScript(() => {
    new MutationObserver((_, observer) => {
      if (!document.querySelector('[role="dialog"]')) return;
      observer.disconnect();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    }).observe(document, { childList: true, subtree: true });
  });
  const confirmacao: Content = { requestId: 'c-2', mode: 'confirmation', kind: 'confirmation', text: 'Apagar o lembrete?', actions: [{ id: 'confirm', label: 'Confirmar' }, { id: 'cancel', label: 'Cancelar' }] };
  await openBar(page, confirmacao);
  await expect(page.getByRole('dialog', { name: 'Barra do assistente' })).toContainText('Apagar o lembrete?');
  await expect.poll(() => calls(page)).toEqual(['action:c-2:cancel']);
});

test('sem conteúdo, a barra não mostra nada', async ({ page }) => {
  await openBar(page, null);
  await expect(bar(page)).toBeHidden();
});

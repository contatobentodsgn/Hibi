import { test, expect, type Page } from '@playwright/test';

const dock = (page: Page) => page.getByRole('navigation', { name: 'Navegação principal' });
const openSettings = async (page: Page) => {
  await dock(page).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Ajustes', exact: true }).click();
};
type Recorded = { setDisplay: (number | null)[]; tests: string[] };
type HibiE2E = {
  recorded: Recorded;
  disconnectInternal: () => void;
  failNext: (kind: 'list' | 'set' | 'test') => void;
  holdTest: () => void;
  releaseTest: () => void;
  holdList: () => void;
  releaseList: () => void;
  recoverList: () => void;
  notifyChanged: () => void;
};
// Lida pelo script de inicialização: as leituras falham desde a abertura, antes de qualquer `page.evaluate`,
// até `recoverList()`. Uma falha única não basta: em dev o efeito roda duas vezes e descarta a primeira resposta.
const FAIL_LIST_AT_START_KEY = 'hibi-e2e-fail-list-at-start';
const readRecorded = (page: Page) => page.evaluate(() => (window as unknown as { hibiE2E: { recorded: Recorded } }).hibiE2E.recorded);
const failNext = (page: Page, kind: 'list' | 'set' | 'test') =>
  page.evaluate((k) => (window as unknown as { hibiE2E: HibiE2E }).hibiE2E.failNext(k), kind);
const notifyChanged = (page: Page) => page.evaluate(() => (window as unknown as { hibiE2E: HibiE2E }).hibiE2E.notifyChanged());
const holdTest = (page: Page) => page.evaluate(() => (window as unknown as { hibiE2E: HibiE2E }).hibiE2E.holdTest());
const releaseTest = (page: Page) => page.evaluate(() => (window as unknown as { hibiE2E: HibiE2E }).hibiE2E.releaseTest());
const holdList = (page: Page) => page.evaluate(() => (window as unknown as { hibiE2E: HibiE2E }).hibiE2E.holdList());
const releaseList = (page: Page) => page.evaluate(() => (window as unknown as { hibiE2E: HibiE2E }).hibiE2E.releaseList());
const recoverList = (page: Page) => page.evaluate(() => (window as unknown as { hibiE2E: HibiE2E }).hibiE2E.recoverList());

async function installBridge(page: Page) {
  await page.addInitScript((failListAtStartKey) => {
    const internal = { id: 1, label: 'Color LCD', primary: false, internal: true, hasCameraHousing: true, width: 1512, height: 982 };
    const lg = { id: 2, label: 'LG ULTRAWIDE', primary: true, internal: false, hasCameraHousing: false, width: 2560, height: 1080 };
    let displays = [lg, internal];
    let preference: { displayId: number | null; displayLabel: string } = { displayId: null, displayLabel: '' };
    let changed: (() => void) | null = null;
    const recorded = { setDisplay: [] as (number | null)[], tests: [] as string[] };
    let failListUntilRecovered = false;
    try { failListUntilRecovered = window.localStorage.getItem(failListAtStartKey) === '1'; window.localStorage.removeItem(failListAtStartKey); } catch { /* sem storage nesta origem */ }
    const failing = { list: false, set: false, test: false };
    let holdNextTest = false;
    let releaseHeldTest: (() => void) | null = null;
    let holdNextList = false;
    let releaseHeldList: (() => void) | null = null;
    // Mesmas regras do processo principal: preferido conectado, tela com câmera, principal.
    const state = () => {
      const preferred = displays.find((display) => display.id === preference.displayId);
      const resolved = preferred ?? displays.find((display) => display.hasCameraHousing) ?? displays.find((display) => display.primary)!;
      return { preference, resolvedDisplayId: resolved.id, reason: preferred ? 'preferred' : resolved.hasCameraHousing ? 'camera-housing' : 'primary', displays };
    };
    (window as unknown as { hibiE2E: unknown }).hibiE2E = {
      recorded,
      disconnectInternal() { displays = [lg]; changed?.(); },
      notifyChanged() { changed?.(); },
      failNext(kind: 'list' | 'set' | 'test') { failing[kind] = true; },
      holdTest() { holdNextTest = true; },
      releaseTest() { releaseHeldTest?.(); releaseHeldTest = null; },
      holdList() { holdNextList = true; },
      releaseList() { releaseHeldList?.(); releaseHeldList = null; },
      recoverList() { failListUntilRecovered = false; },
    };
    (window as unknown as { hibiDesktop: Record<string, unknown> }).hibiDesktop = {
      info: async () => ({ name: 'Hibi', version: '0.1.0', localOnly: true }),
      listNotchDisplays: async () => {
        if (failListUntilRecovered || failing.list) { failing.list = false; throw new Error('falha simulada'); }
        // O retrato é tirado agora: segurado, chega depois com o estado antigo.
        const current = state();
        if (holdNextList) {
          holdNextList = false;
          return new Promise((resolve) => { releaseHeldList = () => resolve(current); });
        }
        return current;
      },
      setNotchDisplay: async (displayId: number | null) => {
        if (failing.set) { failing.set = false; throw new Error('falha simulada'); }
        const target = displays.find((display) => display.id === displayId);
        // Como o processo principal: um monitor que não está conectado é recusado, não vira automático.
        if (displayId !== null && !target) throw new Error('Invalid notch display.');
        recorded.setDisplay.push(displayId);
        preference = target ? { displayId: target.id, displayLabel: target.label } : { displayId: null, displayLabel: '' };
        return state();
      },
      testNotch: async (locale: string) => {
        if (failing.test) { failing.test = false; throw new Error('falha simulada'); }
        recorded.tests.push(locale);
        const current = state();
        const target = current.displays.find((display) => display.id === current.resolvedDisplayId)!;
        const result = { outcome: 'confirmed', displayId: target.id, displayLabel: target.label };
        if (holdNextTest) {
          holdNextTest = false;
          return new Promise((resolve) => { releaseHeldTest = () => resolve(result); });
        }
        return result;
      },
      onNotchDisplaysChanged: (callback: () => void) => { changed = callback; return () => { changed = null; }; },
    };
  }, FAIL_LIST_AT_START_KEY);
}

test.describe('com o bridge do desktop', () => {
  test.beforeEach(async ({ page }) => {
    await installBridge(page);
    await page.goto('/');
    await expect(dock(page)).toBeVisible();
    await openSettings(page);
  });

  test('Ajustes › Geral lista os monitores e troca o monitor do notch', async ({ page }) => {
    const select = page.getByRole('combobox', { name: 'Monitor do notch' });
    await expect(select.locator('option')).toHaveText(['Automático · Color LCD', 'LG ULTRAWIDE · principal', 'Color LCD · com notch']);
    await expect(select).toHaveValue('auto');

    await select.selectOption('2');

    await expect(select).toHaveValue('2');
    await expect(select.locator('option').first()).toHaveText('Automático · LG ULTRAWIDE');
    expect((await readRecorded(page)).setDisplay).toEqual([2]);
  });

  test('"Testar notch" mostra o resultado com o monitor usado', async ({ page }) => {
    await page.getByRole('button', { name: 'Testar notch' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Confirmado pelo notch em Color LCD.' })).toBeVisible();
    expect((await readRecorded(page)).tests).toEqual(['pt']);
  });

  test('um monitor escolhido que sai aparece como desconectado, com o monitor em uso', async ({ page }) => {
    const select = page.getByRole('combobox', { name: 'Monitor do notch' });
    await select.selectOption('1');
    await expect(select).toHaveValue('1');

    await page.evaluate(() => (window as unknown as { hibiE2E: { disconnectInternal: () => void } }).hibiE2E.disconnectInternal());

    await expect(select.locator('option')).toHaveText(['Automático · LG ULTRAWIDE', 'LG ULTRAWIDE · principal', 'Color LCD · desconectado']);
    await expect(select).toHaveValue('1');
    await expect(page.getByText('O notch usa LG ULTRAWIDE até ele voltar.')).toBeVisible();
  });

  test('uma leitura que falha após mudança de monitor mantém as linhas e se recupera', async ({ page }) => {
    await failNext(page, 'list');
    await notifyChanged(page);

    await expect(page.getByText('Não foi possível ler os monitores. Tente de novo em instantes.')).toBeVisible();
    const select = page.getByRole('combobox', { name: 'Monitor do notch' });
    await expect(select).toBeVisible();
    await expect(select.locator('option')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Testar notch' })).toBeVisible();

    await notifyChanged(page);

    await expect(page.getByText('Não foi possível ler os monitores. Tente de novo em instantes.')).toHaveCount(0);
  });

  test('uma gravação que falha mostra a mensagem na linha do monitor', async ({ page }) => {
    await failNext(page, 'set');
    const select = page.getByRole('combobox', { name: 'Monitor do notch' });
    await select.selectOption('2');

    await expect(page.getByText('Não foi possível trocar o monitor do notch.')).toBeVisible();
    const describedBy = await select.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    await expect(page.locator('#' + describedBy!)).toContainText('Não foi possível trocar o monitor do notch.');
    await expect(page.getByRole('status').filter({ hasText: 'Não foi possível trocar o monitor do notch.' })).toHaveCount(0);
  });

  test('um teste que falha mostra a mensagem de falha', async ({ page }) => {
    await failNext(page, 'test');
    await page.getByRole('button', { name: 'Testar notch' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Não foi possível mostrar o teste no notch.' })).toBeVisible();
  });

  test('enquanto o teste roda o botão mantém o foco e diz Testando…', async ({ page }) => {
    await holdTest(page);
    const button = page.getByRole('button', { name: 'Testar notch' });
    await button.focus();
    await button.click();

    const runningButton = page.getByRole('button', { name: 'Testando…' });
    await expect(runningButton).toBeVisible();
    await expect(runningButton).toHaveAttribute('aria-disabled', 'true');
    await expect(runningButton).toBeFocused();

    // force: Playwright trata aria-disabled como "não clicável"; queremos testar a guarda do próprio app.
    await runningButton.click({ force: true });
    expect((await readRecorded(page)).tests).toEqual(['pt']);

    await releaseTest(page);

    await expect(page.getByRole('status').filter({ hasText: 'Confirmado pelo notch em Color LCD.' })).toBeVisible();
    expect((await readRecorded(page)).tests).toEqual(['pt']);
  });

  test('enquanto o teste roda o monitor do notch não pode ser trocado', async ({ page }) => {
    const select = page.getByRole('combobox', { name: 'Monitor do notch' });
    await expect(select).toBeEnabled();
    await holdTest(page);

    await page.getByRole('button', { name: 'Testar notch' }).click();

    await expect(page.getByRole('button', { name: 'Testando…' })).toBeVisible();
    await expect(select).toBeDisabled();

    await releaseTest(page);

    await expect(page.getByRole('status').filter({ hasText: 'Confirmado pelo notch em Color LCD.' })).toBeVisible();
    await expect(select).toBeEnabled();
  });

  test('uma primeira leitura que falha se recupera quando a janela volta ao foco', async ({ page }) => {
    await page.evaluate((key) => window.localStorage.setItem(key, '1'), FAIL_LIST_AT_START_KEY);
    await page.reload();
    await expect(dock(page)).toBeVisible();
    await openSettings(page);

    const note = page.getByText('Não foi possível ler os monitores. Tente de novo em instantes.');
    const select = page.getByRole('combobox', { name: 'Monitor do notch' });
    await expect(note).toBeVisible();
    await expect(select).toBeDisabled();

    await recoverList(page);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));

    await expect(select.locator('option')).toHaveText(['Automático · Color LCD', 'LG ULTRAWIDE · principal', 'Color LCD · com notch']);
    await expect(note).toHaveCount(0);
    await expect(select).toBeEnabled();
  });

  test('uma leitura antiga que chega depois de trocar o monitor não desfaz a escolha', async ({ page }) => {
    const select = page.getByRole('combobox', { name: 'Monitor do notch' });
    await expect(select.locator('option')).toHaveCount(3);
    await holdList(page);
    await notifyChanged(page);

    await select.selectOption('2');
    await expect(select).toHaveValue('2');
    await releaseList(page);
    // Uma volta pelo event loop da página garante que a resposta antiga já foi entregue.
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)));

    await expect(select).toHaveValue('2');
    await expect(select.locator('option').first()).toHaveText('Automático · LG ULTRAWIDE');
  });
});

test.describe('sem o bridge do desktop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(dock(page)).toBeVisible();
    await openSettings(page);
  });

  test('sem o bridge, mostra a mensagem de indisponibilidade', async ({ page }) => {
    await expect(page.getByText('Disponível no app desktop.')).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Monitor do notch' })).toHaveCount(0);
  });
});

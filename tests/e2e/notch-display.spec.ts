import { test, expect, type Page } from '@playwright/test';

const dock = (page: Page) => page.getByRole('navigation', { name: 'Navegação principal' });
const openSettings = async (page: Page) => {
  await dock(page).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Ajustes', exact: true }).click();
};
type Recorded = { setDisplay: (number | null)[]; tests: string[] };
const readRecorded = (page: Page) => page.evaluate(() => (window as unknown as { hibiE2E: { recorded: Recorded } }).hibiE2E.recorded);

async function installBridge(page: Page) {
  await page.addInitScript(() => {
    const internal = { id: 1, label: 'Color LCD', primary: false, internal: true, hasCameraHousing: true, width: 1512, height: 982 };
    const lg = { id: 2, label: 'LG ULTRAWIDE', primary: true, internal: false, hasCameraHousing: false, width: 2560, height: 1080 };
    let displays = [lg, internal];
    let preference: { displayId: number | null; displayLabel: string } = { displayId: null, displayLabel: '' };
    let changed: (() => void) | null = null;
    const recorded = { setDisplay: [] as (number | null)[], tests: [] as string[] };
    // Mesmas regras do processo principal: preferido conectado, tela com câmera, principal.
    const state = () => {
      const preferred = displays.find((display) => display.id === preference.displayId);
      const resolved = preferred ?? displays.find((display) => display.hasCameraHousing) ?? displays.find((display) => display.primary)!;
      return { preference, resolvedDisplayId: resolved.id, reason: preferred ? 'preferred' : resolved.hasCameraHousing ? 'camera-housing' : 'primary', displays };
    };
    (window as unknown as { hibiE2E: unknown }).hibiE2E = {
      recorded,
      disconnectInternal() { displays = [lg]; changed?.(); },
    };
    (window as unknown as { hibiDesktop: Record<string, unknown> }).hibiDesktop = {
      info: async () => ({ name: 'Hibi', version: '0.1.0', localOnly: true }),
      listNotchDisplays: async () => state(),
      setNotchDisplay: async (displayId: number | null) => {
        recorded.setDisplay.push(displayId);
        const target = displays.find((display) => display.id === displayId);
        preference = target ? { displayId: target.id, displayLabel: target.label } : { displayId: null, displayLabel: '' };
        return state();
      },
      testNotch: async (locale: string) => {
        recorded.tests.push(locale);
        const current = state();
        const target = current.displays.find((display) => display.id === current.resolvedDisplayId)!;
        return { outcome: 'confirmed', displayId: target.id, displayLabel: target.label };
      },
      onNotchDisplaysChanged: (callback: () => void) => { changed = callback; return () => { changed = null; }; },
    };
  });
}

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

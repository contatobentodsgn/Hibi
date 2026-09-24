// Validação do monitor do notch no app Electron real, com as telas físicas desta máquina.
// Uso: `npm run build`, depois `node scripts/notch-display-live.mjs <pasta-das-capturas>`.
// Altera a preferência de monitor do app nesta máquina e a devolve para Automático no fim,
// inclusive quando algo falha.
import { _electron as electron } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const shots = process.argv[2];
if (!shots) throw new Error('Informe a pasta das capturas de tela.');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const launch = () => electron.launch({ cwd: root, args: ['electron/main.cjs'], env: { ...process.env, PIXANO_PRODUCTION: '1' } });
const snapshot = (app) => app.evaluate(({ BrowserWindow, screen }) => ({
  displays: screen.getAllDisplays().map((display) => ({ id: display.id, label: display.label, bounds: display.bounds })),
  windows: BrowserWindow.getAllWindows().map((window) => ({ url: window.webContents.getURL(), bounds: window.getBounds(), visible: window.isVisible() })),
}));
const inside = (bounds, area) => bounds.x >= area.x && bounds.x + bounds.width <= area.x + area.width && bounds.y >= area.y && bounds.y < area.y + area.height;

async function waitFor(check, what, attempts = 100, interval = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const value = await check();
    if (value) return value;
    await sleep(interval);
  }
  throw new Error(`tempo esgotado esperando ${what}`);
}
async function openGeneral(app) {
  const page = await app.firstWindow();
  const dock = page.getByRole('navigation', { name: 'Navegação principal' });
  await dock.waitFor();
  await dock.getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('combobox', { name: 'Monitor do notch' }).waitFor();
  return page;
}
// A troca é assíncrona (IPC): espera o processo principal refletir a escolha antes de testar.
async function choose(page, value) {
  await page.getByRole('combobox', { name: 'Monitor do notch' }).selectOption(value);
  return waitFor(async () => {
    const state = await page.evaluate(() => window.pixanoDesktop.listNotchDisplays());
    return (state.preference.displayId === null ? 'auto' : String(state.preference.displayId)) === value ? state : null;
  }, `a escolha ${value}`);
}
function capture(target, file) {
  // O `screencapture -D` numera a tela principal como 1; o roteiro assume duas telas.
  try { execFileSync('screencapture', ['-x', `-D${target.primary ? 1 : 2}`, file]); return file; } catch (error) { return `falhou: ${String(error.message).slice(0, 80)}`; }
}
async function runTest(app, page, value, tag) {
  const state = await choose(page, value);
  const target = state.displays.find((display) => display.id === state.resolvedDisplayId);
  await page.getByRole('button', { name: 'Testar notch' }).click();
  // Cartão passivo: o host nativo informa o monitor e o frame enquanto ele está visível.
  const passiveHost = await waitFor(async () => {
    const host = (await page.evaluate(() => window.pixanoDesktop.getNotchCapabilities())).host;
    return host?.requestId?.startsWith('notch-test-passive-') && host.visible ? host : null;
  }, 'o cartão passivo', 30);
  const passiveShot = capture(target, `${shots}/notch-${tag}-passive.png`);
  // A overlay guarda no DOM os botões da confirmação anterior: só clica depois que o processo
  // principal informa a confirmação deste teste como ativa e a janela está visível.
  const presentation = await waitFor(async () => {
    const current = await page.evaluate(() => window.pixanoDesktop.getNotchPresentation());
    return current?.requestId?.startsWith('notch-test-confirm-') ? current : null;
  }, 'a confirmação', 60);
  await sleep(500);
  const confirmation = await snapshot(app);
  const confirmationWindow = confirmation.windows.find((window) => window.url.includes('overlay=notch') && window.visible);
  const display = confirmation.displays.find((entry) => entry.id === target.id);
  const confirmationShot = capture(target, `${shots}/notch-${tag}-confirmation.png`);
  const card = app.windows().find((window) => window.url().includes('overlay=notch'));
  await card.getByRole('button', { name: 'Apareceu', exact: true }).click();
  const status = page.getByRole('status').filter({ hasText: 'Confirmado pelo notch em' });
  await status.waitFor({ timeout: 10_000 });
  return {
    tag,
    resolved: { id: target.id, label: target.label, reason: state.reason },
    passiveHost: { displayId: passiveHost.displayId, frame: passiveHost.frame, visible: passiveHost.visible, occluded: passiveHost.occluded, activeSpace: passiveHost.activeSpace },
    confirmationRequestId: presentation.requestId,
    confirmationVisible: Boolean(confirmationWindow),
    confirmationInside: Boolean(confirmationWindow && display && inside(confirmationWindow.bounds, display.bounds)),
    confirmationBounds: confirmationWindow?.bounds ?? null,
    displayBounds: display?.bounds ?? null,
    message: await status.textContent(),
    passiveShot,
    confirmationShot,
  };
}
async function moveMainWindow(app, displayId) {
  return app.evaluate(({ BrowserWindow, screen }, id) => {
    const main = BrowserWindow.getAllWindows().find((window) => !window.webContents.getURL().includes('overlay=notch'));
    const display = screen.getAllDisplays().find((entry) => entry.id === id);
    main.setPosition(display.bounds.x + 40, display.bounds.y + 40);
    main.focus();
    return { displayId: id, bounds: main.getBounds() };
  }, displayId);
}
async function restoreAutomatic(page) {
  try { return (await page.evaluate(() => window.pixanoDesktop.setNotchDisplay(null))).preference.displayId === null; } catch { return false; }
}

const report = {};
let app = await launch();
let page;
try {
  page = await openGeneral(app);
  const initial = await page.evaluate(() => window.pixanoDesktop.listNotchDisplays());
  report.initial = initial;
  const external = initial.displays.find((display) => !display.hasCameraHousing);
  const builtIn = initial.displays.find((display) => display.hasCameraHousing);
  if (!external || !builtIn) throw new Error('São necessárias uma tela com câmera e um monitor externo.');
  report.runs = [];
  report.mainWindowOnExternal = await moveMainWindow(app, external.id);
  await sleep(500);
  report.runs.push(await runTest(app, page, 'auto', 'auto'));
  report.runs.push(await runTest(app, page, String(external.id), 'external'));
  report.runs.push(await runTest(app, page, String(builtIn.id), 'built-in'));
  // A conversão nativa de coordenadas dependia da tela com foco: repete com a janela principal do
  // Hibi na tela integrada.
  report.mainWindowOnBuiltIn = await moveMainWindow(app, builtIn.id);
  await sleep(500);
  report.runs.push(await runTest(app, page, String(builtIn.id), 'built-in-window-on-built-in'));
  report.runs.push(await runTest(app, page, String(external.id), 'external-window-on-built-in'));
  // Com o monitor externo como principal, o automático precisa escolher a tela integrada pela câmera.
  report.automaticPicksCameraHousing = report.runs[0].resolved.id === builtIn.id && report.runs[0].resolved.reason === 'camera-housing';
  await choose(page, String(external.id));
  await app.close();

  // O primeiro app já fechou: se reabrir falhar, o `finally` não deve restaurar por ele. `page` volta a valer no app novo.
  page = undefined;
  app = await launch();
  page = await openGeneral(app);
  const afterRestart = await page.evaluate(() => window.pixanoDesktop.listNotchDisplays());
  report.persistsAcrossRestart = afterRestart.preference.displayId === external.id && afterRestart.resolvedDisplayId === external.id;
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
} finally {
  // Deixa o app como estava: automático.
  if (page) report.restoredToAutomatic = await restoreAutomatic(page);
  await app.close().catch(() => undefined);
}
console.log(JSON.stringify(report, null, 2));

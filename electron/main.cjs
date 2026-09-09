const { app, BrowserWindow, ipcMain, Notification, screen, powerMonitor } = require("electron");
const path = require("node:path");
const crypto = require('node:crypto');
const { createNotificationScheduler, sanitizeEntries } = require("./notifications.cjs");
const { createMainAiRuntime, replaceAiRequestCoordinator } = require("./ai-runtime.cjs");
const { createAiConfiguration, createMacKeychain, verifyAndSaveAiConfiguration } = require('./ai-config.cjs');
const { createIntegrationManager } = require('./integrations.cjs');
const { createNotionConnector } = require('./connectors/notion.cjs');
const { createSlackConnector } = require('./connectors/slack.cjs');
const { createEmailConnector } = require('./connectors/email.cjs');
const { createRemoteNotificationConnector } = require('./connectors/remote-notifications.cjs');
const { createLocalApi, createLocalApiTokenStore } = require('./local-api.cjs');
const { createNotchWindowManager } = require("./notch-window.cjs");
const nativeNotchBridge = require("../native/notch/index.cjs");

let mainWindow;
let notificationScheduler;
let aiRuntime;
let aiRequestCoordinator;
let aiConfiguration;
let integrationManager;
let localApi;
let localApiWorkspace = { tasks: [], reminders: [], blocks: [] };
const pendingLocalApiWrites = new Map();
let notchWindow;
let detachNotchLifecycle = () => {};
const isDev = !app.isPackaged && process.env.HIBI_PRODUCTION !== '1';
const MAX_AI_STREAM_DELTA = 8000;
const MAX_AI_STREAM_DELAY = 60_000;
const MAX_AI_STREAM_TEXT = 240;
const notchAdapter = nativeNotchBridge.createNotchAdapter({
  mode: process.env.HIBI_NOTCH_ADAPTER,
  isPackaged: app.isPackaged,
  allowExperimental: process.env.HIBI_ALLOW_EXPERIMENTAL_NOTCH === '1',
  platform: process.platform,
});

function isAllowedNavigation(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === "file:") return true;
    return url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
  } catch {
    return false;
  }
}

function isValidNotchAction(requestId, actionId) {
  return typeof requestId === 'string' && requestId.length > 0 && requestId.length <= 128
    && (actionId === 'confirm' || actionId === 'cancel');
}

function notchCapabilities(adapter, manager) {
  return {
    adapter: adapter.id,
    experimental: adapter.experimental,
    reason: adapter.reason,
    bridgeLoaded: adapter.available?.() === true,
    nativePromotion: adapter.promotionAvailable?.() === true,
    nativeHost: adapter.nativeHostAvailable?.() === true,
    screens: adapter.screenGeometry?.() ?? [],
    host: manager?.diagnostics ?? { available: false },
  };
}

function safeAiFailure(value) {
  if (!value || typeof value !== 'object') return null;
  const code = value.code;
  const retryable = value.retryable;
  if (!['invalid_credentials', 'rate_limited', 'unavailable', 'invalid_response', 'cancelled'].includes(code) || typeof retryable !== 'boolean') return null;
  const retryAfterMs = value.retryAfterMs;
  if (retryAfterMs !== undefined && (!Number.isFinite(retryAfterMs) || retryAfterMs <= 0 || retryAfterMs > MAX_AI_STREAM_DELAY)) return null;
  return { code, retryable, ...(retryAfterMs === undefined ? {} : { retryAfterMs }) };
}

function safeAiUsage(value) {
  if (!value || typeof value !== 'object') return null;
  const inputTokens = value.inputTokens; const outputTokens = value.outputTokens; const totalTokens = value.totalTokens; const estimatedCost = value.estimatedCost;
  if (![inputTokens, outputTokens, totalTokens].every((item) => Number.isFinite(item) && item >= 0) || (estimatedCost !== undefined && (!Number.isFinite(estimatedCost) || estimatedCost < 0))) return null;
  return { inputTokens, outputTokens, totalTokens, ...(estimatedCost === undefined ? {} : { estimatedCost }) };
}

function safeAiStreamEvent(value) {
  if (!value || typeof value !== 'object') return null;
  const requestId = typeof value.requestId === 'string' && value.requestId.length > 0 && value.requestId.length <= MAX_AI_STREAM_TEXT && /^[A-Za-z0-9_-]+$/.test(value.requestId) ? value.requestId : null;
  const correlationId = typeof value.correlationId === 'string' && value.correlationId.length > 0 && value.correlationId.length <= 128 && /^[A-Za-z0-9_-]+$/.test(value.correlationId) ? value.correlationId : null;
  if (!requestId || !correlationId) return null;
  const scoped = (event) => ({ ...event, requestId, correlationId });
  if (value.type === 'delta' && typeof value.delta === 'string' && value.delta.length > 0 && value.delta.length <= MAX_AI_STREAM_DELTA) return scoped({ type: 'delta', delta: value.delta });
  if (value.type === 'usage') { const usage = safeAiUsage(value.usage); return usage ? scoped({ type: 'usage', usage }) : null; }
  if (value.type === 'completed') return scoped({ type: 'completed' });
  if (value.type === 'failed') { const failure = safeAiFailure(value.failure); return failure ? scoped({ type: 'failed', failure }) : null; }
  if (value.type === 'retrying') {
    const failure = safeAiFailure(value.failure);
    if (failure && Number.isInteger(value.attempt) && value.attempt >= 1 && value.attempt <= 2 && Number.isFinite(value.delayMs) && value.delayMs >= 0 && value.delayMs <= MAX_AI_STREAM_DELAY) return scoped({ type: 'retrying', attempt: value.attempt, delayMs: value.delayMs, failure });
  }
  if (value.type === 'started') {
    const provider = typeof value.provider === 'string' && value.provider.length <= MAX_AI_STREAM_TEXT ? value.provider : undefined;
    const model = typeof value.model === 'string' && value.model.length <= MAX_AI_STREAM_TEXT ? value.model : undefined;
    return scoped({ type: 'started', ...(provider === undefined ? {} : { provider }), ...(model === undefined ? {} : { model }) });
  }
  return null;
}

function attachNotchLifecycle({ displayService, powerService, manager }) {
  const reposition = () => manager?.reposition();
  const displayEvents = ['display-added', 'display-removed', 'display-metrics-changed'];
  for (const event of displayEvents) displayService?.on?.(event, reposition);
  powerService?.on?.('resume', reposition);
  return () => {
    for (const event of displayEvents) displayService?.removeListener?.(event, reposition);
    powerService?.removeListener?.('resume', reposition);
  };
}

function attachRendererRecovery(window) {
  let recovering = false;
  const recover = () => {
    if (recovering || window?.isDestroyed?.()) return;
    recovering = true;
    window.webContents?.reloadIgnoringCache?.();
  };
  window?.webContents?.on?.('render-process-gone', recover);
  window?.webContents?.on?.('did-finish-load', () => { recovering = false; });
  return recover;
}

function replaceAiRuntime(runtime) {
  aiRequestCoordinator = replaceAiRequestCoordinator(aiRequestCoordinator, runtime);
  aiRuntime = runtime;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 820, minWidth: 960, minHeight: 620,
    title: "Hibi", backgroundColor: "#050505",
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedNavigation(url)) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => ({
    action: isAllowedNavigation(url) ? "allow" : "deny"
  }));
  attachRendererRecovery(mainWindow);
  if (isDev) { const candidate = process.env.HIBI_DEV_SERVER || "http://127.0.0.1:5173"; const url = new URL(candidate); if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('HIBI_DEV_SERVER must target loopback HTTP'); mainWindow.loadURL(url.toString()); }
  else mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
}

app.whenReady().then(async () => {
  notificationScheduler = createNotificationScheduler({ NotificationClass: Notification, onTrigger: (entry) => mainWindow?.webContents.send('hibi:notification:triggered', entry) });
  aiConfiguration = createAiConfiguration({ filePath: path.join(app.getPath('userData'), 'ai-configuration.json') });
  integrationManager = createIntegrationManager({ connectors: [createNotionConnector(), createSlackConnector(), createEmailConnector(), createRemoteNotificationConnector()], keychain: createMacKeychain() });
  localApi = createLocalApi({ tokenStore: createLocalApiTokenStore({ keychain: createMacKeychain() }), workspace: () => localApiWorkspace, prepareWrite: async (intent) => {
    const confirmationId = `local-api-${crypto.randomUUID()}`;
    pendingLocalApiWrites.set(confirmationId, intent);
    return { confirmationId, requiresConfirmation: true };
  } });
  replaceAiRuntime(createMainAiRuntime({ config: await aiConfiguration.getRuntimeConfig().catch(() => ({})) }));
  notchWindow = createNotchWindowManager({ BrowserWindowClass: BrowserWindow, screen, preloadPath: path.join(__dirname, 'preload.cjs'), nativeBridge: notchAdapter, load: (window) => isDev ? window.loadURL(`${new URL(process.env.HIBI_DEV_SERVER || 'http://127.0.0.1:5173')}?overlay=notch`) : window.loadFile(path.join(__dirname, '../dist/index.html'), { query: { overlay: 'notch' } }), onAction: (action) => mainWindow?.webContents.send('hibi:companion:action', action) });
  detachNotchLifecycle = attachNotchLifecycle({ displayService: screen, powerService: powerMonitor, manager: notchWindow });
  ipcMain.handle("hibi:info", () => ({ name: "Hibi Study Replica", version: app.getVersion(), localOnly: true }));
  ipcMain.handle("hibi:login-item:get", () => app.getLoginItemSettings().openAtLogin);
  ipcMain.handle("hibi:login-item", (_event, enabled) => { app.setLoginItemSettings({ openAtLogin: Boolean(enabled) }); return app.getLoginItemSettings().openAtLogin; });
  ipcMain.handle("hibi:notifications:sync", (_event, entries) => { notificationScheduler.sync(sanitizeEntries(entries)); });
  ipcMain.handle("hibi:notifications:test", () => {
    if (!Notification.isSupported()) return false;
    const notification = new Notification({ title: "Hibi", body: "Native notifications are working." });
    notification.show();
    return true;
  });
  ipcMain.handle('hibi:ai:run', (event, turn) => {
    const correlationId = typeof turn?.correlationId === 'string' && turn.correlationId.length > 0 && turn.correlationId.length <= 128 && /^[A-Za-z0-9_-]+$/.test(turn.correlationId) ? turn.correlationId : null;
    if (!correlationId) throw new Error('Invalid AI correlation id.');
    return aiRequestCoordinator.run(event.sender, turn?.request, correlationId, (streamEvent) => {
    const safeEvent = safeAiStreamEvent(streamEvent);
    if (safeEvent && !event.sender.isDestroyed()) event.sender.send('hibi:ai:stream', safeEvent);
    });
  });
  ipcMain.handle('hibi:ai:cancel', (event, value) => aiRequestCoordinator.cancel(event.sender, value?.requestId, value?.correlationId));
  ipcMain.handle('hibi:ai-config:get', () => aiConfiguration.getStatus());
  ipcMain.handle('hibi:ai-config:save', async (_event, value) => {
    const status = await verifyAndSaveAiConfiguration({ configuration: aiConfiguration, value, verifyCandidate: async (config) => createMainAiRuntime({ config }).testConnection() });
    replaceAiRuntime(createMainAiRuntime({ config: await aiConfiguration.getRuntimeConfig().catch(() => ({})) }));
    return status;
  });
  ipcMain.handle('hibi:ai-config:delete-key', async () => {
    const status = await aiConfiguration.deleteKey();
    replaceAiRuntime(createMainAiRuntime());
    return status;
  });
  ipcMain.handle('hibi:integrations:list-status', () => integrationManager.listStatus());
  ipcMain.handle('hibi:integrations:connect', (_event, connectorId, credential) => integrationManager.connect(connectorId, { credential }));
  ipcMain.handle('hibi:integrations:audit', () => integrationManager.audit());
  ipcMain.handle('hibi:integrations:revoke', (_event, connectorId) => integrationManager.revoke(connectorId));
  ipcMain.handle('hibi:integrations:prepare-action', (_event, input) => integrationManager.prepareAction(input));
  ipcMain.handle('hibi:integrations:execute-approved', (_event, input) => integrationManager.executeApproved(input));
  ipcMain.handle('hibi:local-api:sync-workspace', (_event, value) => {
    const safe = value && typeof value === 'object' ? value : {};
    localApiWorkspace = { tasks: Array.isArray(safe.tasks) ? safe.tasks.slice(0, 5_000) : [], reminders: Array.isArray(safe.reminders) ? safe.reminders.slice(0, 5_000) : [], blocks: Array.isArray(safe.blocks) ? safe.blocks.slice(0, 5_000) : [] };
  });
  ipcMain.handle('hibi:local-api:start', async () => {
    const started = await localApi.start();
    return { origin: started.origin };
  });
  ipcMain.handle('hibi:local-api:stop', async () => { await localApi.stop(); return { running: false }; });
  ipcMain.handle('hibi:local-api:status', () => ({ running: localApi.isRunning() }));
  ipcMain.handle('hibi:notch:show', (_event, presentation) => notchWindow.show(presentation));
  ipcMain.handle('hibi:notch:hide', (_event, requestId) => notchWindow.hide(typeof requestId === 'string' ? requestId : ''));
  ipcMain.handle('hibi:notch:action', (_event, requestId, actionId) => isValidNotchAction(requestId, actionId) && notchWindow.resolveAction(requestId, actionId));
  ipcMain.handle('hibi:notch:capabilities', () => notchCapabilities(notchAdapter, notchWindow));
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("before-quit", () => { detachNotchLifecycle(); notificationScheduler?.clear(); void localApi?.stop(); notchWindow?.destroy(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

module.exports = { isAllowedNavigation, isValidNotchAction, notchCapabilities, attachNotchLifecycle, attachRendererRecovery, safeAiStreamEvent };

const { app, BrowserWindow, ipcMain, Notification } = require("electron");
const path = require("node:path");
const { createNotificationScheduler, sanitizeEntries } = require("./notifications.cjs");
const { createMainAiRuntime } = require("./ai-runtime.cjs");
const { createAiConfiguration, verifyAndSaveAiConfiguration } = require('./ai-config.cjs');
const { createNotchWindowManager } = require("./notch-window.cjs");
const nativeNotchBridge = require("../native/notch/index.cjs");

let mainWindow;
let notificationScheduler;
let aiRuntime;
let aiConfiguration;
let notchWindow;
const isDev = !app.isPackaged && process.env.HIBI_PRODUCTION !== '1';
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
  if (isDev) { const candidate = process.env.HIBI_DEV_SERVER || "http://127.0.0.1:5173"; const url = new URL(candidate); if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('HIBI_DEV_SERVER must target loopback HTTP'); mainWindow.loadURL(url.toString()); }
  else mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
}

app.whenReady().then(async () => {
  notificationScheduler = createNotificationScheduler({ NotificationClass: Notification, onTrigger: (entry) => mainWindow?.webContents.send('hibi:notification:triggered', entry) });
  aiConfiguration = createAiConfiguration({ filePath: path.join(app.getPath('userData'), 'ai-configuration.json') });
  aiRuntime = createMainAiRuntime({ config: await aiConfiguration.getRuntimeConfig().catch(() => ({})) });
  notchWindow = createNotchWindowManager({ BrowserWindowClass: BrowserWindow, screen: require('electron').screen, preloadPath: path.join(__dirname, 'preload.cjs'), nativeBridge: notchAdapter, load: (window) => isDev ? window.loadURL(`${new URL(process.env.HIBI_DEV_SERVER || 'http://127.0.0.1:5173')}?overlay=notch`) : window.loadFile(path.join(__dirname, '../dist/index.html'), { query: { overlay: 'notch' } }), onAction: (action) => mainWindow?.webContents.send('hibi:companion:action', action) });
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
  ipcMain.handle('hibi:ai:run', (_event, turn) => aiRuntime.run(turn));
  ipcMain.handle('hibi:ai:cancel', () => { aiRuntime.cancel(); return true; });
  ipcMain.handle('hibi:ai-config:get', () => aiConfiguration.getStatus());
  ipcMain.handle('hibi:ai-config:save', async (_event, value) => {
    const status = await verifyAndSaveAiConfiguration({ configuration: aiConfiguration, value, verifyCandidate: async (config) => createMainAiRuntime({ config }).testConnection() });
    aiRuntime = createMainAiRuntime({ config: await aiConfiguration.getRuntimeConfig().catch(() => ({})) });
    return status;
  });
  ipcMain.handle('hibi:ai-config:delete-key', async () => {
    const status = await aiConfiguration.deleteKey();
    aiRuntime = createMainAiRuntime();
    return status;
  });
  ipcMain.handle('hibi:notch:show', (_event, presentation) => notchWindow.show(presentation));
  ipcMain.handle('hibi:notch:hide', (_event, requestId) => notchWindow.hide(typeof requestId === 'string' ? requestId : ''));
  ipcMain.handle('hibi:notch:action', (_event, requestId, actionId) => isValidNotchAction(requestId, actionId) && notchWindow.resolveAction(requestId, actionId));
  ipcMain.handle('hibi:notch:capabilities', () => ({
    adapter: notchAdapter.id,
    experimental: notchAdapter.experimental,
    reason: notchAdapter.reason,
    bridgeLoaded: notchAdapter.available?.() === true,
    nativePromotion: notchAdapter.promotionAvailable?.() === true,
    screens: notchAdapter.screenGeometry?.() ?? [],
  }));
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("before-quit", () => { notificationScheduler?.clear(); notchWindow?.destroy(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

module.exports = { isAllowedNavigation, isValidNotchAction };

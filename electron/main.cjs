const { app, BrowserWindow, ipcMain, Notification } = require("electron");
const path = require("node:path");
const { createNotificationScheduler, sanitizeEntries } = require("./notifications.cjs");
const { createMainAiRuntime } = require("./ai-runtime.cjs");
const { createNotchWindowManager } = require("./notch-window.cjs");
const nativeNotchBridge = require("../native/notch/index.cjs");

let mainWindow;
let notificationScheduler;
let aiRuntime;
let notchWindow;
const isDev = !app.isPackaged && process.env.HIBI_PRODUCTION !== '1';

function isAllowedNavigation(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === "file:") return true;
    return url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
  } catch {
    return false;
  }
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

app.whenReady().then(() => {
  notificationScheduler = createNotificationScheduler({ NotificationClass: Notification });
  aiRuntime = createMainAiRuntime();
  notchWindow = createNotchWindowManager({ BrowserWindowClass: BrowserWindow, screen: require('electron').screen, preloadPath: path.join(__dirname, 'preload.cjs'), nativeBridge: nativeNotchBridge, load: (window) => isDev ? window.loadURL(`${new URL(process.env.HIBI_DEV_SERVER || 'http://127.0.0.1:5173')}?overlay=notch`) : window.loadFile(path.join(__dirname, '../dist/index.html'), { query: { overlay: 'notch' } }) });
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
  ipcMain.handle('hibi:notch:show', (_event, presentation) => notchWindow.show(presentation));
  ipcMain.handle('hibi:notch:hide', (_event, requestId) => notchWindow.hide(typeof requestId === 'string' ? requestId : ''));
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("before-quit", () => { notificationScheduler?.clear(); notchWindow?.destroy(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

module.exports = { isAllowedNavigation };

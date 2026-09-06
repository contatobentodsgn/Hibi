const { app, BrowserWindow, ipcMain, Notification } = require("electron");
const path = require("node:path");
const { createNotificationScheduler } = require("./notifications.cjs");

let mainWindow;
let notificationScheduler;
const isDev = !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 820, minWidth: 960, minHeight: 620,
    title: "Hibi", backgroundColor: "#050505",
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false }
  });
  if (isDev) mainWindow.loadURL(process.env.HIBI_DEV_SERVER || "http://localhost:5173");
  else mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
}

app.whenReady().then(() => {
  notificationScheduler = createNotificationScheduler({ NotificationClass: Notification });
  ipcMain.handle("hibi:info", () => ({ name: "Hibi Study Replica", version: app.getVersion(), localOnly: true }));
  ipcMain.handle("hibi:login-item", (_event, enabled) => { app.setLoginItemSettings({ openAtLogin: Boolean(enabled) }); return app.getLoginItemSettings().openAtLogin; });
  ipcMain.handle("hibi:notifications:sync", (_event, entries) => { notificationScheduler.sync(entries); });
  ipcMain.handle("hibi:notifications:test", () => {
    if (!Notification.isSupported()) return false;
    const notification = new Notification({ title: "Hibi", body: "Native notifications are working." });
    notification.show();
    return true;
  });
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("before-quit", () => notificationScheduler?.clear());
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

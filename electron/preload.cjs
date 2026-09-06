const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hibiDesktop", {
  info: () => ipcRenderer.invoke("hibi:info"),
  getOpenAtLogin: () => ipcRenderer.invoke("hibi:login-item:get"),
  setOpenAtLogin: (enabled) => ipcRenderer.invoke("hibi:login-item", enabled),
  syncNotifications: (entries) => ipcRenderer.invoke("hibi:notifications:sync", entries),
  showTestNotification: () => ipcRenderer.invoke("hibi:notifications:test")
});

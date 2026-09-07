const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hibiDesktop", {
  info: () => ipcRenderer.invoke("hibi:info"),
  getOpenAtLogin: () => ipcRenderer.invoke("hibi:login-item:get"),
  setOpenAtLogin: (enabled) => ipcRenderer.invoke("hibi:login-item", enabled),
  syncNotifications: (entries) => ipcRenderer.invoke("hibi:notifications:sync", entries),
  showTestNotification: () => ipcRenderer.invoke("hibi:notifications:test")
  ,runAiTurn: (turn) => ipcRenderer.invoke('hibi:ai:run', turn)
  ,cancelAiTurn: () => ipcRenderer.invoke('hibi:ai:cancel')
  ,showNotch: (presentation) => ipcRenderer.invoke('hibi:notch:show', presentation)
  ,hideNotch: (requestId) => ipcRenderer.invoke('hibi:notch:hide', requestId)
  ,resolveNotchAction: (requestId, actionId) => ipcRenderer.invoke('hibi:notch:action', requestId, actionId)
  ,getNotchCapabilities: () => ipcRenderer.invoke('hibi:notch:capabilities')
  ,onCompanionPresentation: (callback) => { const listener = (_event, presentation) => callback(presentation); ipcRenderer.on('hibi:companion:presentation', listener); return () => ipcRenderer.removeListener('hibi:companion:presentation', listener); }
  ,onCompanionAction: (callback) => { const listener = (_event, action) => callback(action); ipcRenderer.on('hibi:companion:action', listener); return () => ipcRenderer.removeListener('hibi:companion:action', listener); }
});

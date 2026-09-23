const { contextBridge, ipcRenderer } = require('electron');

// A janela do notch é pequena, fica sempre visível e mostra texto que vem de fora do app. Ela só
// precisa receber a apresentação ativa e responder a confirmação que está na tela: nada de IA,
// Keychain, OAuth, webhook ou API local. O nome da ponte é o mesmo do app de propósito, para a
// overlay não precisar saber em qual janela está rodando.
contextBridge.exposeInMainWorld('pixanoDesktop', {
  getNotchPresentation: () => ipcRenderer.invoke('pixano:notch:current'),
  hideNotch: (requestId) => ipcRenderer.invoke('pixano:notch:hide', requestId),
  resolveNotchAction: (requestId, actionId) => ipcRenderer.invoke('pixano:notch:action', requestId, actionId),
  onCompanionPresentation: (callback) => {
    const listener = (_event, presentation) => callback(presentation);
    ipcRenderer.on('pixano:companion:presentation', listener);
    return () => ipcRenderer.removeListener('pixano:companion:presentation', listener);
  },
});

const { contextBridge, ipcRenderer } = require('electron');

// A janela do notch é pequena, fica sempre visível e mostra texto que vem de fora do app. Ela só
// precisa receber a apresentação ativa e responder a confirmação que está na tela: nada de IA,
// Keychain, OAuth, webhook ou API local. O nome da ponte é o mesmo do app de propósito, para a
// overlay não precisar saber em qual janela está rodando.
contextBridge.exposeInMainWorld('hibiDesktop', {
  getNotchPresentation: () => ipcRenderer.invoke('hibi:notch:current'),
  hideNotch: (requestId) => ipcRenderer.invoke('hibi:notch:hide', requestId),
  resolveNotchAction: (requestId, actionId) => ipcRenderer.invoke('hibi:notch:action', requestId, actionId),
  onCompanionPresentation: (callback) => {
    const listener = (_event, presentation) => callback(presentation);
    ipcRenderer.on('hibi:companion:presentation', listener);
    return () => ipcRenderer.removeListener('hibi:companion:presentation', listener);
  },
});

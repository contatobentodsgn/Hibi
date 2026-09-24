const { contextBridge, ipcRenderer } = require('electron');

// A barra do Assistant, embaixo do notch. Ela mostra o pedido, o ditado, a resposta e a confirmação, e
// devolve só o que a pessoa fez nela: texto enviado, falar ou parar, um botão, fechar. Nada de IA,
// Keychain, OAuth, webhook ou API local — isso tudo continua na janela principal do Hibi.
contextBridge.exposeInMainWorld('pixanoBar', {
  current: () => ipcRenderer.invoke('pixano:bar:current'),
  submit: (text) => ipcRenderer.invoke('pixano:bar:submit', text),
  voice: (command) => ipcRenderer.invoke('pixano:bar:voice', command),
  action: (requestId, actionId) => ipcRenderer.invoke('pixano:bar:action', requestId, actionId),
  close: () => ipcRenderer.invoke('pixano:bar:close'),
  reopen: () => ipcRenderer.invoke('pixano:bar:reopen'),
  openAssistant: () => ipcRenderer.invoke('pixano:bar:open-assistant'),
  onContent: (callback) => {
    const listener = (_event, content) => callback(content);
    ipcRenderer.on('pixano:bar:content', listener);
    return () => ipcRenderer.removeListener('pixano:bar:content', listener);
  },
});

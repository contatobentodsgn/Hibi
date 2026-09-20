const { contextBridge, ipcRenderer } = require('electron');

// A barra do Taby, embaixo do notch. Ela mostra o pedido, o ditado, a resposta e a confirmação, e
// devolve só o que a pessoa fez nela: texto enviado, falar ou parar, um botão, fechar. Nada de IA,
// Keychain, OAuth, webhook ou API local — isso tudo continua na janela principal do Hibi.
contextBridge.exposeInMainWorld('hibiBar', {
  current: () => ipcRenderer.invoke('hibi:bar:current'),
  submit: (text) => ipcRenderer.invoke('hibi:bar:submit', text),
  voice: (command) => ipcRenderer.invoke('hibi:bar:voice', command),
  action: (requestId, actionId) => ipcRenderer.invoke('hibi:bar:action', requestId, actionId),
  close: () => ipcRenderer.invoke('hibi:bar:close'),
  onContent: (callback) => {
    const listener = (_event, content) => callback(content);
    ipcRenderer.on('hibi:bar:content', listener);
    return () => ipcRenderer.removeListener('hibi:bar:content', listener);
  },
});

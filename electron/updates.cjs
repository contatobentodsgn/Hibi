const { existsSync } = require('node:fs');
const path = require('node:path');

/**
 * O serviço de atualização.
 *
 * Nada é baixado sem pedido: são dezenas de megabytes e a decisão é de quem usa o app. O endereço
 * do feed vem do **empacotamento** (`app-update.yml`, escrito pelo electron-builder a partir de
 * `build.publish`), e não de variável de ambiente: num app aberto pelo Finder não existe ambiente
 * nenhum, e ler dali deixaria o serviço desligado para sempre. A variável continua valendo como
 * atalho de teste, para apontar um feed local sem reempacotar.
 */
function createUpdateService({ autoUpdater, isPackaged, feedUrl, hasPackagedFeed = false, onEvent = () => {} } = {}) {
  const enabled = Boolean(isPackaged && autoUpdater && (hasPackagedFeed || feedUrl));
  let state = { status: enabled ? 'idle' : 'disabled', version: null, error: null };
  const publish = (patch) => { state = { ...state, ...patch }; onEvent(state); return state; };
  if (enabled) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    // Só sobrescreve o feed do pacote quando alguém pediu outro de propósito.
    if (feedUrl) autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl });
    autoUpdater.on('checking-for-update', () => publish({ status: 'checking', error: null }));
    autoUpdater.on('update-available', (info) => publish({ status: 'available', version: info?.version ?? null }));
    autoUpdater.on('update-not-available', () => publish({ status: 'current', version: null }));
    autoUpdater.on('download-progress', (progress) => publish({ status: 'downloading', percent: Math.round(progress?.percent ?? 0) }));
    autoUpdater.on('update-downloaded', (info) => publish({ status: 'downloaded', version: info?.version ?? state.version, percent: 100 }));
    autoUpdater.on('error', (error) => publish({ status: 'error', error: error?.message || 'Update check failed.' }));
  }
  return {
    enabled,
    state: () => ({ ...state }),
    // Uma falha de rede é estado na tela, nunca exceção atravessando o IPC.
    check: async () => {
      if (!enabled) return publish({ status: 'disabled' });
      try { await autoUpdater.checkForUpdates(); } catch (error) { return publish({ status: 'error', error: error?.message || 'Update check failed.' }); }
      return state;
    },
    download: async () => {
      if (!enabled || state.status !== 'available') return state;
      try { await autoUpdater.downloadUpdate(); } catch (error) { return publish({ status: 'error', error: error?.message || 'Update download failed.' }); }
      return state;
    },
    install: () => {
      if (!enabled || state.status !== 'downloaded') return state;
      // O macOS só substitui um app por outro com a mesma assinatura: num app ad-hoc isto falha, e
      // a falha precisa aparecer na tela em vez de parecer que nada aconteceu.
      try { autoUpdater.quitAndInstall(); } catch (error) { return publish({ status: 'error', error: error?.message || 'Update install failed.' }); }
      return state;
    },
  };
}

/** O electron-builder escreve este arquivo ao lado dos recursos do app empacotado. */
const packagedFeedPath = (resourcesPath = process.resourcesPath) => (resourcesPath ? path.join(resourcesPath, 'app-update.yml') : '');

function createElectronUpdateService({ app, autoUpdater, onEvent, exists = existsSync, resourcesPath = process.resourcesPath } = {}) {
  const feedPath = packagedFeedPath(resourcesPath);
  return createUpdateService({
    autoUpdater,
    isPackaged: app?.isPackaged,
    feedUrl: process.env.HIBI_UPDATE_FEED_URL,
    hasPackagedFeed: Boolean(feedPath && exists(feedPath)),
    onEvent,
  });
}

module.exports = { createUpdateService, createElectronUpdateService, packagedFeedPath };

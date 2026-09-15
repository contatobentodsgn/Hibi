function createUpdateService({ autoUpdater, isPackaged, feedUrl, onEvent = () => {} } = {}) {
  const enabled = Boolean(isPackaged && feedUrl && autoUpdater);
  let state = { status: enabled ? 'idle' : 'disabled', version: null, error: null };
  const publish = (patch) => { state = { ...state, ...patch }; onEvent(state); return state; };
  if (enabled) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl });
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
    check: async () => { if (!enabled) return publish({ status: 'disabled' }); await autoUpdater.checkForUpdates(); return state; },
    download: async () => { if (!enabled || state.status !== 'available') return state; await autoUpdater.downloadUpdate(); return state; },
    install: () => { if (enabled && state.status === 'downloaded') autoUpdater.quitAndInstall(); },
  };
}

function createElectronUpdateService({ app, autoUpdater, onEvent } = {}) {
  return createUpdateService({
    app,
    autoUpdater,
    isPackaged: app?.isPackaged,
    feedUrl: process.env.HIBI_UPDATE_FEED_URL,
    onEvent,
  });
}

module.exports = { createUpdateService, createElectronUpdateService };

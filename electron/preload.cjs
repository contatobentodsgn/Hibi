const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hibiDesktop", {
  info: () => ipcRenderer.invoke("hibi:info"),
  getOpenAtLogin: () => ipcRenderer.invoke("hibi:login-item:get"),
  setOpenAtLogin: (enabled) => ipcRenderer.invoke("hibi:login-item", enabled),
  syncNotifications: (entries, context) => ipcRenderer.invoke("hibi:notifications:sync", entries, context),
  showTestNotification: () => ipcRenderer.invoke("hibi:notifications:test")
  ,runAiTurn: (turn) => ipcRenderer.invoke('hibi:ai:run', turn)
  ,cancelAiTurn: (request) => ipcRenderer.invoke('hibi:ai:cancel', request)
  ,getAiConfig: () => ipcRenderer.invoke('hibi:ai-config:get')
  ,saveAiConfig: (config) => ipcRenderer.invoke('hibi:ai-config:save', config)
  ,deleteAiKey: () => ipcRenderer.invoke('hibi:ai-config:delete-key')
  ,listIntegrationStatus: () => ipcRenderer.invoke('hibi:integrations:list-status')
  ,connectIntegration: (connectorId, credential) => ipcRenderer.invoke('hibi:integrations:connect', connectorId, credential)
  ,listIntegrationAudit: () => ipcRenderer.invoke('hibi:integrations:audit')
  ,revokeIntegration: (connectorId) => ipcRenderer.invoke('hibi:integrations:revoke', connectorId)
  ,prepareIntegrationAction: (input) => ipcRenderer.invoke('hibi:integrations:prepare-action', input)
  ,executeApprovedIntegrationAction: (input) => ipcRenderer.invoke('hibi:integrations:execute-approved', input)
  ,syncLocalApiWorkspace: (workspace) => ipcRenderer.invoke('hibi:local-api:sync-workspace', workspace)
  ,startLocalApi: () => ipcRenderer.invoke('hibi:local-api:start')
  ,stopLocalApi: () => ipcRenderer.invoke('hibi:local-api:stop')
  ,getLocalApiStatus: () => ipcRenderer.invoke('hibi:local-api:status')
  ,testIntegrationConnection: (connectorId) => ipcRenderer.invoke('hibi:integrations:test-connection', connectorId)
  ,listIntegrationImportTargets: (connectorId) => ipcRenderer.invoke('hibi:integrations:import-targets', connectorId)
  ,listIntegrationImportCandidates: (connectorId) => ipcRenderer.invoke('hibi:integrations:import-candidates', connectorId)
  ,discoverNotionDataSource: (databaseId) => ipcRenderer.invoke('hibi:notion:discover-data-source', databaseId)
  ,getConnectorSettings: (connectorId) => ipcRenderer.invoke('hibi:integrations:get-settings', connectorId)
  ,saveConnectorSettings: (connectorId, patch) => ipcRenderer.invoke('hibi:integrations:save-settings', connectorId, patch)
  ,isOauthSupported: (connectorId) => ipcRenderer.invoke('hibi:oauth:supported', connectorId)
  ,authorizeIntegration: (connectorId) => ipcRenderer.invoke('hibi:oauth:authorize', connectorId)
  ,refreshIntegrationAuthorization: (connectorId) => ipcRenderer.invoke('hibi:oauth:refresh', connectorId)
  ,cancelIntegrationAuthorization: () => ipcRenderer.invoke('hibi:oauth:cancel')
  ,hasOauthClientSecret: (connectorId) => ipcRenderer.invoke('hibi:oauth:client-secret', connectorId)
  ,saveOauthClientSecret: (connectorId, secret) => ipcRenderer.invoke('hibi:oauth:save-client-secret', connectorId, secret)
  ,clearOauthClientSecret: (connectorId) => ipcRenderer.invoke('hibi:oauth:clear-client-secret', connectorId)
  ,getCalendarSyncState: () => ipcRenderer.invoke('hibi:calendar-sync:state')
  ,requestAppleCalendarAccess: () => ipcRenderer.invoke('hibi:calendar-sync:request-apple-access')
  ,discoverGoogleCalendars: () => ipcRenderer.invoke('hibi:calendar-sync:discover-google-calendars')
  ,readCalendarSyncEvents: (input) => ipcRenderer.invoke('hibi:calendar-sync:read-events', input)
  ,saveCalendarSyncMode: (input) => ipcRenderer.invoke('hibi:calendar-sync:save-calendar-mode', input)
  ,prepareCalendarPublish: (input) => ipcRenderer.invoke('hibi:calendar-sync:prepare-publish', input)
  ,executeApprovedCalendarPublish: (input) => ipcRenderer.invoke('hibi:calendar-sync:execute-approved', input)
  ,prepareCalendarUpdate: (input) => ipcRenderer.invoke('hibi:calendar-sync:prepare-update', input)
  ,resolveCalendarConflict: (input) => ipcRenderer.invoke('hibi:calendar-sync:resolve-conflict', input)
  ,configureWebhook: (secret) => ipcRenderer.invoke('hibi:webhook:configure', secret)
  ,startWebhook: () => ipcRenderer.invoke('hibi:webhook:start')
  ,stopWebhook: () => ipcRenderer.invoke('hibi:webhook:stop')
  ,getWebhookStatus: () => ipcRenderer.invoke('hibi:webhook:status')
  ,readWorkspace: () => ipcRenderer.invoke('hibi:workspace:read')
  ,saveWorkspace: (input) => ipcRenderer.invoke('hibi:workspace:save', input)
  ,listWorkspaceRestorePoints: () => ipcRenderer.invoke('hibi:workspace:restore-points')
  ,restoreWorkspace: (input) => ipcRenderer.invoke('hibi:workspace:restore', input)
  ,resolveLocalApiWrite: (input) => ipcRenderer.invoke('hibi:local-api:resolve-write', input)
  ,showNotch: (presentation) => ipcRenderer.invoke('hibi:notch:show', presentation)
  ,hideNotch: (requestId) => ipcRenderer.invoke('hibi:notch:hide', requestId)
  ,resolveNotchAction: (requestId, actionId) => ipcRenderer.invoke('hibi:notch:action', requestId, actionId)
  ,getNotchPresentation: () => ipcRenderer.invoke('hibi:notch:current')
  ,getNotchCapabilities: () => ipcRenderer.invoke('hibi:notch:capabilities')
  ,listNotchDisplays: () => ipcRenderer.invoke('hibi:notch:displays')
  ,setNotchDisplay: (displayId) => ipcRenderer.invoke('hibi:notch:set-display', displayId)
  ,getLocalModelState: () => ipcRenderer.invoke('hibi:local-model:state')
  ,verifyLocalModel: () => ipcRenderer.invoke('hibi:local-model:verify')
  ,downloadLocalModel: () => ipcRenderer.invoke('hibi:local-model:download')
  ,cancelLocalModelDownload: () => ipcRenderer.invoke('hibi:local-model:cancel-download')
  ,onLocalModelDownloadProgress: (callback) => { if (typeof callback !== 'function') throw new TypeError('Download listener must be a function.'); const listener = (_event, state) => callback(state); ipcRenderer.on('hibi:local-model:download-progress', listener); return () => ipcRenderer.removeListener('hibi:local-model:download-progress', listener); }
  ,getLocalVoiceState: () => ipcRenderer.invoke('hibi:local-voice:state')
  ,listenLocalVoice: () => ipcRenderer.invoke('hibi:local-voice:listen')
  ,setLocalVoiceLocale: (locale) => ipcRenderer.invoke('hibi:local-voice:set-locale', locale)
  ,stopLocalVoice: () => ipcRenderer.invoke('hibi:local-voice:stop')
  ,onLocalVoiceText: (callback) => { if (typeof callback !== 'function') throw new TypeError('Voice listener must be a function.'); const listener = (_event, text) => { if (typeof text === 'string') callback(text); }; ipcRenderer.on('hibi:local-voice:text', listener); return () => ipcRenderer.removeListener('hibi:local-voice:text', listener); }
  ,getNotchSize: () => ipcRenderer.invoke('hibi:notch:size')
  ,setNotchSize: (size) => ipcRenderer.invoke('hibi:notch:set-size', size)
  ,testNotch: (locale) => ipcRenderer.invoke('hibi:notch:test', locale)
  ,onNotchDisplaysChanged: (callback) => { const listener = () => callback(); ipcRenderer.on('hibi:notch:displays-changed', listener); return () => ipcRenderer.removeListener('hibi:notch:displays-changed', listener); }
  ,onAiStreamEvent: (callback) => {
    if (typeof callback !== 'function') throw new TypeError('AI stream listener must be a function.');
    let subscribed = true;
    const listener = (_event, streamEvent) => { if (subscribed && streamEvent && typeof streamEvent === 'object') callback(streamEvent); };
    ipcRenderer.on('hibi:ai:stream', listener);
    return () => {
      if (!subscribed) return;
      subscribed = false;
      ipcRenderer.removeListener('hibi:ai:stream', listener);
    };
  }
  ,onCompanionPresentation: (callback) => { const listener = (_event, presentation) => callback(presentation); ipcRenderer.on('hibi:companion:presentation', listener); return () => ipcRenderer.removeListener('hibi:companion:presentation', listener); }
  ,onCompanionAction: (callback) => { const listener = (_event, action) => callback(action); ipcRenderer.on('hibi:companion:action', listener); return () => ipcRenderer.removeListener('hibi:companion:action', listener); }
  ,onNotificationTriggered: (callback) => { const listener = (_event, entry) => callback(entry); ipcRenderer.on('hibi:notification:triggered', listener); return () => ipcRenderer.removeListener('hibi:notification:triggered', listener); }
  ,watchFocusPresence: (request) => ipcRenderer.invoke('hibi:focus:watch-presence', request)
  ,onFocusPresence: (callback) => { const listener = (_event, presence) => { if (presence && typeof presence === 'object') callback(presence); }; ipcRenderer.on('hibi:focus:presence', listener); return () => ipcRenderer.removeListener('hibi:focus:presence', listener); }
  ,onLocalApiConfirmation:(callback) => { const listener = (_event, intent) => callback(intent); ipcRenderer.on('hibi:local-api:confirmation', listener); return () => ipcRenderer.removeListener('hibi:local-api:confirmation', listener); }
});

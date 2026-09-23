const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pixanoDesktop", {
  info: () => ipcRenderer.invoke("pixano:info"),
  getOpenAtLogin: () => ipcRenderer.invoke("pixano:login-item:get"),
  setOpenAtLogin: (enabled) => ipcRenderer.invoke("pixano:login-item", enabled),
  syncNotifications: (entries, context) => ipcRenderer.invoke("pixano:notifications:sync", entries, context),
  showTestNotification: () => ipcRenderer.invoke("pixano:notifications:test")
  ,runAiTurn: (turn) => ipcRenderer.invoke('pixano:ai:run', turn)
  ,cancelAiTurn: (request) => ipcRenderer.invoke('pixano:ai:cancel', request)
  ,getAiConfig: () => ipcRenderer.invoke('pixano:ai-config:get')
  ,saveAiConfig: (config) => ipcRenderer.invoke('pixano:ai-config:save', config)
  ,deleteAiKey: () => ipcRenderer.invoke('pixano:ai-config:delete-key')
  ,listIntegrationStatus: () => ipcRenderer.invoke('pixano:integrations:list-status')
  ,connectIntegration: (connectorId, credential) => ipcRenderer.invoke('pixano:integrations:connect', connectorId, credential)
  ,listIntegrationAudit: () => ipcRenderer.invoke('pixano:integrations:audit')
  ,revokeIntegration: (connectorId) => ipcRenderer.invoke('pixano:integrations:revoke', connectorId)
  ,prepareIntegrationAction: (input) => ipcRenderer.invoke('pixano:integrations:prepare-action', input)
  ,executeApprovedIntegrationAction: (input) => ipcRenderer.invoke('pixano:integrations:execute-approved', input)
  ,syncLocalApiWorkspace: (workspace) => ipcRenderer.invoke('pixano:local-api:sync-workspace', workspace)
  ,startLocalApi: () => ipcRenderer.invoke('pixano:local-api:start')
  ,stopLocalApi: () => ipcRenderer.invoke('pixano:local-api:stop')
  ,getLocalApiStatus: () => ipcRenderer.invoke('pixano:local-api:status')
  ,testIntegrationConnection: (connectorId) => ipcRenderer.invoke('pixano:integrations:test-connection', connectorId)
  ,listIntegrationImportTargets: (connectorId) => ipcRenderer.invoke('pixano:integrations:import-targets', connectorId)
  ,listIntegrationImportCandidates: (connectorId) => ipcRenderer.invoke('pixano:integrations:import-candidates', connectorId)
  ,discoverNotionDataSource: (databaseId) => ipcRenderer.invoke('pixano:notion:discover-data-source', databaseId)
  ,getConnectorSettings: (connectorId) => ipcRenderer.invoke('pixano:integrations:get-settings', connectorId)
  ,saveConnectorSettings: (connectorId, patch) => ipcRenderer.invoke('pixano:integrations:save-settings', connectorId, patch)
  ,isOauthSupported: (connectorId) => ipcRenderer.invoke('pixano:oauth:supported', connectorId)
  ,authorizeIntegration: (connectorId) => ipcRenderer.invoke('pixano:oauth:authorize', connectorId)
  ,refreshIntegrationAuthorization: (connectorId) => ipcRenderer.invoke('pixano:oauth:refresh', connectorId)
  ,cancelIntegrationAuthorization: () => ipcRenderer.invoke('pixano:oauth:cancel')
  ,hasOauthClientSecret: (connectorId) => ipcRenderer.invoke('pixano:oauth:client-secret', connectorId)
  ,saveOauthClientSecret: (connectorId, secret) => ipcRenderer.invoke('pixano:oauth:save-client-secret', connectorId, secret)
  ,clearOauthClientSecret: (connectorId) => ipcRenderer.invoke('pixano:oauth:clear-client-secret', connectorId)
  ,getCalendarSyncState: () => ipcRenderer.invoke('pixano:calendar-sync:state')
  ,requestAppleCalendarAccess: () => ipcRenderer.invoke('pixano:calendar-sync:request-apple-access')
  ,discoverGoogleCalendars: () => ipcRenderer.invoke('pixano:calendar-sync:discover-google-calendars')
  ,readCalendarSyncEvents: (input) => ipcRenderer.invoke('pixano:calendar-sync:read-events', input)
  ,saveCalendarSyncMode: (input) => ipcRenderer.invoke('pixano:calendar-sync:save-calendar-mode', input)
  ,prepareCalendarPublish: (input) => ipcRenderer.invoke('pixano:calendar-sync:prepare-publish', input)
  ,executeApprovedCalendarPublish: (input) => ipcRenderer.invoke('pixano:calendar-sync:execute-approved', input)
  ,prepareCalendarUpdate: (input) => ipcRenderer.invoke('pixano:calendar-sync:prepare-update', input)
  ,resolveCalendarConflict: (input) => ipcRenderer.invoke('pixano:calendar-sync:resolve-conflict', input)
  ,listCalendarSyncChanges: () => ipcRenderer.invoke('pixano:calendar-sync:changes')
  ,acknowledgeCalendarIncoming: (input) => ipcRenderer.invoke('pixano:calendar-sync:acknowledge-incoming', input)
  ,configureWebhook: (secret) => ipcRenderer.invoke('pixano:webhook:configure', secret)
  ,startWebhook: () => ipcRenderer.invoke('pixano:webhook:start')
  ,stopWebhook: () => ipcRenderer.invoke('pixano:webhook:stop')
  ,getWebhookStatus: () => ipcRenderer.invoke('pixano:webhook:status')
  ,readWorkspace: () => ipcRenderer.invoke('pixano:workspace:read')
  ,saveWorkspace: (input) => ipcRenderer.invoke('pixano:workspace:save', input)
  ,listWorkspaceRestorePoints: () => ipcRenderer.invoke('pixano:workspace:restore-points')
  ,restoreWorkspace: (input) => ipcRenderer.invoke('pixano:workspace:restore', input)
  ,resolveLocalApiWrite: (input) => ipcRenderer.invoke('pixano:local-api:resolve-write', input)
  ,showNotch: (presentation) => ipcRenderer.invoke('pixano:notch:show', presentation)
  ,hideNotch: (requestId) => ipcRenderer.invoke('pixano:notch:hide', requestId)
  ,resolveNotchAction: (requestId, actionId) => ipcRenderer.invoke('pixano:notch:action', requestId, actionId)
  ,getNotchPresentation: () => ipcRenderer.invoke('pixano:notch:current')
  ,getNotchCapabilities: () => ipcRenderer.invoke('pixano:notch:capabilities')
  ,listNotchDisplays: () => ipcRenderer.invoke('pixano:notch:displays')
  ,setNotchDisplay: (displayId) => ipcRenderer.invoke('pixano:notch:set-display', displayId)
  ,getLocalModelState: () => ipcRenderer.invoke('pixano:local-model:state')
  ,verifyLocalModel: () => ipcRenderer.invoke('pixano:local-model:verify')
  ,downloadLocalModel: () => ipcRenderer.invoke('pixano:local-model:download')
  ,cancelLocalModelDownload: () => ipcRenderer.invoke('pixano:local-model:cancel-download')
  ,onLocalModelDownloadProgress: (callback) => { if (typeof callback !== 'function') throw new TypeError('Download listener must be a function.'); const listener = (_event, state) => callback(state); ipcRenderer.on('pixano:local-model:download-progress', listener); return () => ipcRenderer.removeListener('pixano:local-model:download-progress', listener); }
  ,runLocalModel: (input) => ipcRenderer.invoke('pixano:local-model:run', input)
  ,cancelLocalModel: (requestId) => ipcRenderer.invoke('pixano:local-model:cancel', requestId)
  ,shutdownLocalModel: () => ipcRenderer.invoke('pixano:local-model:shutdown')
  ,getLocalVoiceState: () => ipcRenderer.invoke('pixano:local-voice:state')
  ,listenLocalVoice: (options) => ipcRenderer.invoke('pixano:local-voice:listen', { autoStop: options?.autoStop === true, vocabulary: Array.isArray(options?.vocabulary) ? options.vocabulary.filter((term) => typeof term === 'string') : [] })
  ,speakLocalVoice: (text) => ipcRenderer.invoke('pixano:local-voice:speak', text)
  ,getVoiceSettings: () => ipcRenderer.invoke('pixano:voice-settings:get')
  ,setVoiceSettings: (patch) => ipcRenderer.invoke('pixano:voice-settings:set', patch)
  ,setLocalVoiceLocale: (locale) => ipcRenderer.invoke('pixano:local-voice:set-locale', locale)
  ,stopLocalVoice: () => ipcRenderer.invoke('pixano:local-voice:stop')
  ,onLocalVoiceText: (callback) => { if (typeof callback !== 'function') throw new TypeError('Voice listener must be a function.'); const listener = (_event, text) => { if (typeof text === 'string') callback(text); }; ipcRenderer.on('pixano:local-voice:text', listener); return () => ipcRenderer.removeListener('pixano:local-voice:text', listener); }
  ,getNotchSize: () => ipcRenderer.invoke('pixano:notch:size')
  ,setNotchSize: (size) => ipcRenderer.invoke('pixano:notch:set-size', size)
  ,testNotch: (locale) => ipcRenderer.invoke('pixano:notch:test', locale)
  ,getNotchWindowPlacement: () => ipcRenderer.invoke('pixano:notch:window-placement')
  ,onNotchWindowPlacementChanged: (callback) => { if (typeof callback !== 'function') throw new TypeError('Placement listener must be a function.'); const listener = (_event, state) => callback({ sharesDisplay: state?.sharesDisplay === true }); ipcRenderer.on('pixano:notch:window-placement-changed', listener); return () => ipcRenderer.removeListener('pixano:notch:window-placement-changed', listener); }
  ,onNotchDisplaysChanged: (callback) => { const listener = () => callback(); ipcRenderer.on('pixano:notch:displays-changed', listener); return () => ipcRenderer.removeListener('pixano:notch:displays-changed', listener); }
  ,getUpdateState: () => ipcRenderer.invoke('pixano:updates:state')
  ,checkForUpdate: () => ipcRenderer.invoke('pixano:updates:check')
  ,downloadUpdate: () => ipcRenderer.invoke('pixano:updates:download')
  ,installUpdate: () => ipcRenderer.invoke('pixano:updates:install')
  ,onUpdateState: (callback) => { const listener = (_event, state) => callback(state); ipcRenderer.on('pixano:updates:state', listener); return () => ipcRenderer.removeListener('pixano:updates:state', listener); }
  ,getAssistantShortcut: () => ipcRenderer.invoke('pixano:shortcut:get')
  ,setAssistantShortcut: (accelerator) => ipcRenderer.invoke('pixano:shortcut:set', accelerator)
  ,onBarSubmit: (callback) => { const listener = (_event, text) => { if (typeof text === 'string') callback(text); }; ipcRenderer.on('pixano:bar:submit', listener); return () => ipcRenderer.removeListener('pixano:bar:submit', listener); }
  ,onBarVoice: (callback) => { const listener = (_event, command) => { if (command === 'start' || command === 'stop') callback(command); }; ipcRenderer.on('pixano:bar:voice', listener); return () => ipcRenderer.removeListener('pixano:bar:voice', listener); }
  ,onBarClosed: (callback) => { const listener = (_event, requestId) => { if (typeof requestId === 'string') callback(requestId); }; ipcRenderer.on('pixano:bar:closed', listener); return () => ipcRenderer.removeListener('pixano:bar:closed', listener); }
  ,onAssistantShortcut: (callback) => { const listener = (_event, request) => callback({ listen: request?.listen === true, background: request?.background === true }); ipcRenderer.on('pixano:shortcut:assistant', listener); return () => ipcRenderer.removeListener('pixano:shortcut:assistant', listener); }
  ,onAiStreamEvent: (callback) => {
    if (typeof callback !== 'function') throw new TypeError('AI stream listener must be a function.');
    let subscribed = true;
    const listener = (_event, streamEvent) => { if (subscribed && streamEvent && typeof streamEvent === 'object') callback(streamEvent); };
    ipcRenderer.on('pixano:ai:stream', listener);
    return () => {
      if (!subscribed) return;
      subscribed = false;
      ipcRenderer.removeListener('pixano:ai:stream', listener);
    };
  }
  ,onCompanionPresentation: (callback) => { const listener = (_event, presentation) => callback(presentation); ipcRenderer.on('pixano:companion:presentation', listener); return () => ipcRenderer.removeListener('pixano:companion:presentation', listener); }
  ,onCompanionAction: (callback) => { const listener = (_event, action) => callback(action); ipcRenderer.on('pixano:companion:action', listener); return () => ipcRenderer.removeListener('pixano:companion:action', listener); }
  ,onNotificationTriggered: (callback) => { const listener = (_event, entry) => callback(entry); ipcRenderer.on('pixano:notification:triggered', listener); return () => ipcRenderer.removeListener('pixano:notification:triggered', listener); }
  ,watchFocusPresence: (request) => ipcRenderer.invoke('pixano:focus:watch-presence', request)
  ,onFocusPresence: (callback) => { const listener = (_event, presence) => { if (presence && typeof presence === 'object') callback(presence); }; ipcRenderer.on('pixano:focus:presence', listener); return () => ipcRenderer.removeListener('pixano:focus:presence', listener); }
  ,onLocalApiConfirmation:(callback) => { const listener = (_event, intent) => callback(intent); ipcRenderer.on('pixano:local-api:confirmation', listener); return () => ipcRenderer.removeListener('pixano:local-api:confirmation', listener); }
});

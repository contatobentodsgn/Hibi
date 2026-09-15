const {
  app,
  BrowserWindow,
  ipcMain,
  Notification,
  dialog,
  screen,
  shell,
  powerMonitor,
  systemPreferences,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const {
  createNotificationScheduler,
  sanitizeEntries,
} = require("./notifications.mjs");
const { createPresenceMonitor } = require("./focus-presence.mjs");
const {
  createMainAiRuntime,
  replaceAiRequestCoordinator,
} = require("./ai-runtime.cjs");
const {
  createAiConfiguration,
  createMacKeychain,
  verifyAndSaveAiConfiguration,
} = require("./ai-config.cjs");
const { createIntegrationManager } = require("./integrations.cjs");
const { createNotionConnector } = require("./connectors/notion.cjs");
const { createSlackConnector } = require("./connectors/slack.cjs");
const { createEmailConnector } = require("./connectors/email.cjs");
const {
  createRemoteNotificationConnector,
} = require("./connectors/remote-notifications.cjs");
const { createLocalApi, createLocalApiTokenStore } = require("./local-api.cjs");
const { createWebhookService } = require("./webhooks.cjs");
const { createOAuthService } = require("./oauth.cjs");
const { createConnectorSettings } = require("./connector-settings.cjs");
const { buildConnectors } = require("./connectors/index.cjs");
const { createCalendarSyncService } = require("./calendar-sync-service.cjs");
const { createCalendarSyncSettings } = require("./calendar-sync-settings.cjs");
const eventKitCalendar = require("../native/notch/calendar.cjs");
const {
  createNotchWindowManager,
  validPresentation,
} = require("./notch-window.cjs");
const {
  createNotchSettings,
  notchDisplayState,
  applyNotchDisplay,
} = require("./notch-settings.cjs");
const { createNotchTest, NOTCH_TEST_PREFIX } = require("./notch-test.cjs");
const { showStartupNotch } = require("./notch-startup.cjs");
const { createWorkspaceDatabase } = require("./workspace-database.cjs");
const { createElectronUpdateService } = require("./updates.cjs");
const { createLocalModelService } = require("./local-model-service.cjs");
const { createLocalVoiceService } = require("./local-voice.cjs");
const { createMacVoiceAdapter } = require("./local-voice-macos.cjs");
const { createDeviceAdapter } = require("./device-adapter.mjs");
const nativeNotchBridge = require("../native/notch/index.cjs");

let mainWindow;
let notificationScheduler;
let presenceMonitor;
let aiRuntime;
let aiRequestCoordinator;
let aiConfiguration;
let integrationManager;
let localApi;
let webhookService;
let connectorSettings;
let oauthService;
let calendarSyncService;
let calendarSyncSettings;
let localApiWorkspace = { tasks: [], reminders: [], blocks: [] };
const pendingLocalApiWrites = new Map();
let notchWindow;
let notchSettings;
let workspaceDatabase;
let notchTest;
let updateService;
let localModelService;
let localVoiceService;
let deviceAdapter;
let detachNotchLifecycle = () => {};
const isDev = !app.isPackaged && process.env.HIBI_PRODUCTION !== "1";
const MAX_AI_STREAM_DELTA = 8000;
const MAX_AI_STREAM_DELAY = 60_000;
const MAX_AI_STREAM_TEXT = 240;
const notchAdapter = nativeNotchBridge.createNotchAdapter({
  mode: process.env.HIBI_NOTCH_ADAPTER,
  isPackaged: app.isPackaged,
  allowExperimental: process.env.HIBI_ALLOW_EXPERIMENTAL_NOTCH === "1",
  platform: process.platform,
});
const startupNotchAnimationPath = app.isPackaged
  ? path.join(process.resourcesPath || __dirname, "companion-assets", "animations", "notch", "idle_01_loop.mp4")
  : path.join(__dirname, "..", "public", "companion-assets", "animations", "notch", "idle_01_loop.mp4");

function isAllowedNavigation(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === "file:") return true;
    return (
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

function isValidNotchAction(requestId, actionId) {
  return (
    typeof requestId === "string" &&
    requestId.length > 0 &&
    requestId.length <= 128 &&
    (actionId === "confirm" || actionId === "cancel")
  );
}

// O teste do notch espera as próprias respostas aqui; repassá-las entregaria ao renderer respostas de confirmações que ele não abriu.
function routeNotchAction(action, { notchTest, send }) {
  if (notchTest?.handleAction(action)) return "test";
  send("hibi:companion:action", action);
  return "renderer";
}

// O prefixo é do teste do notch: uma apresentação do renderer com ele teria a resposta engolida pelo teste.
function isRendererPresentationAllowed(presentation) {
  return (
    Boolean(validPresentation(presentation)) &&
    !presentation.requestId.startsWith(NOTCH_TEST_PREFIX)
  );
}

function notchCapabilities(adapter, manager) {
  return {
    adapter: adapter.id,
    experimental: adapter.experimental,
    reason: adapter.reason,
    bridgeLoaded: adapter.available?.() === true,
    nativePromotion: adapter.promotionAvailable?.() === true,
    nativeHost: adapter.nativeHostAvailable?.() === true,
    screens: adapter.screenGeometry?.() ?? [],
    host: manager?.diagnostics ?? { available: false },
  };
}

function safeAiFailure(value) {
  if (!value || typeof value !== "object") return null;
  const code = value.code;
  const retryable = value.retryable;
  if (
    ![
      "invalid_credentials",
      "rate_limited",
      "unavailable",
      "invalid_request",
      "invalid_response",
      "cancelled",
    ].includes(code) ||
    typeof retryable !== "boolean"
  )
    return null;
  const retryAfterMs = value.retryAfterMs;
  if (
    retryAfterMs !== undefined &&
    (!Number.isFinite(retryAfterMs) ||
      retryAfterMs <= 0 ||
      retryAfterMs > MAX_AI_STREAM_DELAY)
  )
    return null;
  return {
    code,
    retryable,
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  };
}

function safeAiUsage(value) {
  if (!value || typeof value !== "object") return null;
  const inputTokens = value.inputTokens;
  const outputTokens = value.outputTokens;
  const totalTokens = value.totalTokens;
  const estimatedCost = value.estimatedCost;
  if (
    ![inputTokens, outputTokens, totalTokens].every(
      (item) => Number.isFinite(item) && item >= 0,
    ) ||
    (estimatedCost !== undefined &&
      (!Number.isFinite(estimatedCost) || estimatedCost < 0))
  )
    return null;
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    ...(estimatedCost === undefined ? {} : { estimatedCost }),
  };
}

function safeAiStreamEvent(value) {
  if (!value || typeof value !== "object") return null;
  const requestId =
    typeof value.requestId === "string" &&
    value.requestId.length > 0 &&
    value.requestId.length <= MAX_AI_STREAM_TEXT &&
    /^[A-Za-z0-9_-]+$/.test(value.requestId)
      ? value.requestId
      : null;
  const correlationId =
    typeof value.correlationId === "string" &&
    value.correlationId.length > 0 &&
    value.correlationId.length <= 128 &&
    /^[A-Za-z0-9_-]+$/.test(value.correlationId)
      ? value.correlationId
      : null;
  if (!requestId || !correlationId) return null;
  const scoped = (event) => ({ ...event, requestId, correlationId });
  if (
    value.type === "delta" &&
    typeof value.delta === "string" &&
    value.delta.length > 0 &&
    value.delta.length <= MAX_AI_STREAM_DELTA
  )
    return scoped({ type: "delta", delta: value.delta });
  if (value.type === "usage") {
    const usage = safeAiUsage(value.usage);
    return usage ? scoped({ type: "usage", usage }) : null;
  }
  if (value.type === "completed") return scoped({ type: "completed" });
  if (value.type === "failed") {
    const failure = safeAiFailure(value.failure);
    return failure ? scoped({ type: "failed", failure }) : null;
  }
  if (value.type === "retrying") {
    const failure = safeAiFailure(value.failure);
    if (
      failure &&
      Number.isInteger(value.attempt) &&
      value.attempt >= 1 &&
      value.attempt <= 2 &&
      Number.isFinite(value.delayMs) &&
      value.delayMs >= 0 &&
      value.delayMs <= MAX_AI_STREAM_DELAY
    )
      return scoped({
        type: "retrying",
        attempt: value.attempt,
        delayMs: value.delayMs,
        failure,
      });
  }
  if (value.type === "started") {
    const provider =
      typeof value.provider === "string" &&
      value.provider.length <= MAX_AI_STREAM_TEXT
        ? value.provider
        : undefined;
    const model =
      typeof value.model === "string" &&
      value.model.length <= MAX_AI_STREAM_TEXT
        ? value.model
        : undefined;
    return scoped({
      type: "started",
      ...(provider === undefined ? {} : { provider }),
      ...(model === undefined ? {} : { model }),
    });
  }
  return null;
}

function attachNotchLifecycle({
  displayService,
  powerService,
  manager,
  onDisplaysChanged,
  log = (message, error) => console.error(message, error),
}) {
  // Um throw aqui derruba o diálogo modal de erro do Electron, e `display-metrics-changed`
  // dispara com frequência: uma falha persistente empilharia diálogos. Loga em vez de propagar.
  const reposition = () => {
    try {
      manager?.reposition();
    } catch (error) {
      log("[notch] reposition failed", error);
    }
  };
  // Os Ajustes precisam reler os monitores mesmo se reposicionar falhar.
  const displaysChanged = () => {
    reposition();
    onDisplaysChanged?.();
  };
  const displayEvents = [
    "display-added",
    "display-removed",
    "display-metrics-changed",
  ];
  for (const event of displayEvents)
    displayService?.on?.(event, displaysChanged);
  powerService?.on?.("resume", reposition);
  return () => {
    for (const event of displayEvents)
      displayService?.removeListener?.(event, displaysChanged);
    powerService?.removeListener?.("resume", reposition);
  };
}

function attachRendererRecovery(window, { showWarning } = {}) {
  let recovering = false;
  let warned = false;
  const notify = showWarning ?? ((details, retry) => {
    void dialog?.showMessageBox?.(window, {
      type: "warning",
      title: "Hibi",
      message: "O Hibi encontrou um problema ao carregar a interface.",
      detail: "Você pode tentar carregar novamente ou encerrar o app.",
      buttons: ["Tentar novamente", "Encerrar"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    }).then(({ response }) => {
      if (response === 0) retry();
    }).catch(() => {});
  });
  const recover = (_event, details = {}) => {
    if (recovering || window?.isDestroyed?.()) return;
    if (warned) return;
    recovering = true;
    window.webContents?.reloadIgnoringCache?.();
  };
  const onRendererGone = (_event, details = {}) => {
    if (window?.isDestroyed?.()) return;
    if (recovering) {
      recovering = false;
      if (!warned) {
        warned = true;
        const reason = typeof details.reason === "string" && details.reason.length <= 80 ? details.reason : "unknown";
        notify({ reason }, () => {
          recovering = false;
          warned = false;
          recover();
        });
      }
      return;
    }
    recover();
  };
  window?.webContents?.on?.("render-process-gone", onRendererGone);
  window?.webContents?.on?.("did-finish-load", () => {
    recovering = false;
    warned = false;
  });
  return recover;
}

// No macOS a janela principal pode ter sido fechada enquanto o app continua vivo.
function sendToMainWindow(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed())
    mainWindow.webContents.send(channel, ...args);
}

function replaceAiRuntime(runtime) {
  aiRequestCoordinator = replaceAiRequestCoordinator(
    aiRequestCoordinator,
    runtime,
  );
  aiRuntime = runtime;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 620,
    title: "Hibi",
    backgroundColor: "#f3f2ef",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 14, y: 12 },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedNavigation(url)) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => ({
    action: isAllowedNavigation(url) ? "allow" : "deny",
  }));
  attachRendererRecovery(mainWindow);
  if (isDev) {
    const candidate = process.env.HIBI_DEV_SERVER || "http://127.0.0.1:5173";
    const url = new URL(candidate);
    if (
      url.protocol !== "http:" ||
      !["127.0.0.1", "localhost"].includes(url.hostname)
    )
      throw new Error("HIBI_DEV_SERVER must target loopback HTTP");
    mainWindow.loadURL(url.toString());
  } else mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
}

app.whenReady().then(async () => {
  let autoUpdater;
  if (app.isPackaged && process.env.HIBI_UPDATE_FEED_URL) {
    try { ({ autoUpdater } = require("electron-updater")); } catch (error) { console.warn("Hibi updater unavailable:", error?.message); }
  }
  updateService = createElectronUpdateService({ app, autoUpdater, onEvent: (state) => sendToMainWindow("hibi:updates:state", state) });
  const projectModelRoot = path.join(__dirname, "..", ".hibi-local-models", "qwen3-1.7b");
  const packagedModelRoot = path.join(app.getPath("userData"), ".hibi-local-models");
  const modelRoot = app.isPackaged ? packagedModelRoot : projectModelRoot;
  let engineFactory;
  try {
    ({ createLlamaEngine: engineFactory } = await import("./local-model-engine.mjs"));
  } catch (error) {
    console.warn("Hibi local model runtime unavailable:", error?.message);
  }
  localModelService = createLocalModelService({ dataRoot: modelRoot, engineFactory: engineFactory ? ({ modelPath }) => engineFactory({ modelPath }) : undefined });
  try {
    const manifestPath = path.join(modelRoot, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const modelPath = path.join(modelRoot, `${manifest.id}.bin`);
    if (fs.existsSync(modelPath)) await localModelService.load({ manifest, modelPath });
  } catch (error) {
    console.warn("Hibi local model not loaded:", error?.message);
  }
  localVoiceService = createLocalVoiceService({ adapter: process.platform === "darwin" ? createMacVoiceAdapter() : undefined });
  deviceAdapter = createDeviceAdapter();
  notificationScheduler = createNotificationScheduler({
    NotificationClass: Notification,
    onTrigger: (entry) =>
      sendToMainWindow("hibi:notification:triggered", entry),
  });
  aiConfiguration = createAiConfiguration({
    filePath: path.join(app.getPath("userData"), "ai-configuration.json"),
  });
  const secureKeychain = createMacKeychain();
  connectorSettings = createConnectorSettings({
    filePath: path.join(app.getPath("userData"), "connector-settings.json"),
  });
  calendarSyncSettings = createCalendarSyncSettings({
    filePath: path.join(app.getPath("userData"), "calendar-sync.json"),
  });
  integrationManager = createIntegrationManager({
    connectors: buildConnectors(connectorSettings),
    keychain: secureKeychain,
  });
  oauthService = createOAuthService({
    keychain: secureKeychain,
    getConnector: (id) => integrationManager.getConnector(id),
    getClientSecret: async (connectorId) => {
      const account = `integration:${connectorId}:client-secret`;
      return secureKeychain.has(account) ? secureKeychain.get(account) : undefined;
    },
    openExternal: (url) => shell.openExternal(url),
  });
  calendarSyncService = createCalendarSyncService({
    eventKit: eventKitCalendar,
    integrations: integrationManager,
    settings: connectorSettings,
    calendarSettings: calendarSyncSettings,
    workspace: () => localApiWorkspace,
  });
  localApi = createLocalApi({
    tokenStore: createLocalApiTokenStore({ keychain: createMacKeychain() }),
    workspace: () => localApiWorkspace,
    prepareWrite: async (intent) => {
      const confirmationId = `local-api-${crypto.randomUUID()}`;
      pendingLocalApiWrites.set(confirmationId, intent);
      sendToMainWindow("hibi:local-api:confirmation", {
        confirmationId,
        kind: intent.kind,
        payload: intent.payload,
      });
      return { confirmationId, requiresConfirmation: true };
    },
  });
  webhookService = createWebhookService({ keychain: secureKeychain });
  replaceAiRuntime(
    createMainAiRuntime({
      config: await aiConfiguration.getRuntimeConfig().catch(() => ({})),
    }),
  );
  notchSettings = createNotchSettings({
    filePath: path.join(app.getPath("userData"), "notch-settings.json"),
  });
  if (typeof app.getPath === "function") {
    workspaceDatabase = createWorkspaceDatabase({ filePath: path.join(app.getPath("userData"), "workspace.sqlite") });
  }
  notchWindow = createNotchWindowManager({
    BrowserWindowClass: BrowserWindow,
    screen,
    preloadPath: path.join(__dirname, "notch-preload.cjs"),
    nativeBridge: notchAdapter,
    preferredDisplayId: notchSettings.get().displayId,
    size: notchSettings.get().size,
    load: (window) =>
      isDev
        ? window.loadURL(
            `${new URL(process.env.HIBI_DEV_SERVER || "http://127.0.0.1:5173")}?overlay=notch`,
          )
        : window.loadFile(path.join(__dirname, "../dist/index.html"), {
            query: { overlay: "notch" },
          }),
    onAction: (action) => {
      routeNotchAction(action, { notchTest, send: sendToMainWindow });
    },
  });
  notchTest = createNotchTest({ manager: notchWindow });
  detachNotchLifecycle = attachNotchLifecycle({
    displayService: screen,
    powerService: powerMonitor,
    manager: notchWindow,
    onDisplaysChanged: () => sendToMainWindow("hibi:notch:displays-changed"),
  });
  ipcMain.handle("hibi:info", () => ({
    name: "Hibi Study Replica",
    version: app.getVersion(),
    localOnly: true,
  }));
  ipcMain.handle("hibi:updates:state", () => updateService.state());
  ipcMain.handle("hibi:updates:check", () => updateService.check());
  ipcMain.handle("hibi:updates:download", () => updateService.download());
  ipcMain.handle("hibi:updates:install", () => updateService.install());
  ipcMain.handle("hibi:local-model:state", () => localModelService.state());
  ipcMain.handle("hibi:local-model:run", (_event, input) => localModelService.run(input));
  ipcMain.handle("hibi:local-model:cancel", (_event, requestId) => localModelService.cancel(requestId));
  ipcMain.handle("hibi:local-model:shutdown", () => localModelService.shutdown());
  ipcMain.handle("hibi:local-voice:state", () => localVoiceService.state());
  ipcMain.handle("hibi:local-voice:listen", async () => {
    if (process.platform === "darwin" && systemPreferences?.askForMediaAccess) {
      const allowed = await systemPreferences.askForMediaAccess("microphone");
      if (!allowed) return { status: "error", error: "Acesso ao microfone foi negado nas configurações do macOS." };
    }
    return localVoiceService.listen({ onText: (text) => sendToMainWindow("hibi:local-voice:text", text) });
  });
  ipcMain.handle("hibi:local-voice:set-locale", (_event, locale) => localVoiceService.setLocale(locale));
  ipcMain.handle("hibi:local-voice:stop", () => localVoiceService.stop());
  ipcMain.handle("hibi:device:state", () => deviceAdapter.state());
  ipcMain.handle("hibi:device:connect", () => deviceAdapter.connect());
  ipcMain.handle("hibi:device:close", () => deviceAdapter.close());
  ipcMain.handle(
    "hibi:login-item:get",
    () => app.getLoginItemSettings().openAtLogin,
  );
  ipcMain.handle("hibi:login-item", (_event, enabled) => {
    app.setLoginItemSettings({ openAtLogin: Boolean(enabled) });
    return app.getLoginItemSettings().openAtLogin;
  });
  // O contexto de foco (janela da sessão em andamento e ajustes) chega junto das entradas: o portão
  // que decide o que fica quieto mora no agendador, e o renderer é quem conhece o estado da sessão.
  ipcMain.handle("hibi:notifications:sync", (_event, entries, context) => {
    notificationScheduler.sync(sanitizeEntries(entries), context);
  });
  // Presença durante o foco. O renderer pede vigia só com uma sessão rodando (ou pausada por ausência,
  // esperando a volta); sem pedido não há intervalo nem ouvinte de bloqueio e sono. Ausência e retorno
  // voltam por um canal só deles: é a tela de Foco que decide perguntar, pausar ou seguir contando.
  presenceMonitor = createPresenceMonitor({
    powerMonitor,
    onChange: (event) => sendToMainWindow("hibi:focus:presence", event),
  });
  ipcMain.handle("hibi:focus:watch-presence", (_event, request) =>
    presenceMonitor.watch(request),
  );
  ipcMain.handle("hibi:notifications:test", () => {
    if (!Notification.isSupported()) return false;
    const notification = new Notification({
      title: "Hibi",
      body: "Native notifications are working.",
    });
    notification.show();
    return true;
  });
  ipcMain.handle("hibi:ai:run", (event, turn) => {
    const correlationId =
      typeof turn?.correlationId === "string" &&
      turn.correlationId.length > 0 &&
      turn.correlationId.length <= 128 &&
      /^[A-Za-z0-9_-]+$/.test(turn.correlationId)
        ? turn.correlationId
        : null;
    if (!correlationId) throw new Error("Invalid AI correlation id.");
    return aiRequestCoordinator.run(
      event.sender,
      turn?.request,
      correlationId,
      (streamEvent) => {
        const safeEvent = safeAiStreamEvent(streamEvent);
        if (safeEvent && !event.sender.isDestroyed())
          event.sender.send("hibi:ai:stream", safeEvent);
      },
    );
  });
  ipcMain.handle("hibi:ai:cancel", (event, value) =>
    aiRequestCoordinator.cancel(
      event.sender,
      value?.requestId,
      value?.correlationId,
    ),
  );
  ipcMain.handle("hibi:ai-config:get", () => aiConfiguration.getStatus());
  ipcMain.handle("hibi:ai-config:save", async (_event, value) => {
    const status = await verifyAndSaveAiConfiguration({
      configuration: aiConfiguration,
      value,
      verifyCandidate: async (config) =>
        createMainAiRuntime({ config }).testConnection(),
    });
    replaceAiRuntime(
      createMainAiRuntime({
        config: await aiConfiguration.getRuntimeConfig().catch(() => ({})),
      }),
    );
    return status;
  });
  ipcMain.handle("hibi:ai-config:delete-key", async () => {
    const status = await aiConfiguration.deleteKey();
    replaceAiRuntime(createMainAiRuntime());
    return status;
  });
  ipcMain.handle("hibi:integrations:list-status", () =>
    integrationManager.listStatus(),
  );
  ipcMain.handle(
    "hibi:integrations:connect",
    (_event, connectorId, credential) =>
      integrationManager.connect(connectorId, { credential }),
  );
  ipcMain.handle("hibi:integrations:audit", () => integrationManager.audit());
  ipcMain.handle("hibi:integrations:revoke", (_event, connectorId) =>
    integrationManager.revoke(connectorId),
  );
  ipcMain.handle("hibi:integrations:prepare-action", (_event, input) =>
    integrationManager.prepareAction(input),
  );
  ipcMain.handle("hibi:integrations:execute-approved", (_event, input) =>
    integrationManager.executeApproved(input),
  );
  ipcMain.handle("hibi:integrations:test-connection", (_event, connectorId) =>
    integrationManager.testConnection(connectorId),
  );
  ipcMain.handle("hibi:integrations:import-targets", (_event, connectorId) =>
    integrationManager.listImportTargets(connectorId),
  );
  ipcMain.handle("hibi:integrations:import-candidates", (_event, connectorId) =>
    integrationManager.listImportCandidates(connectorId, {
      targets: connectorSettings.get(connectorId).targets,
    }),
  );
  ipcMain.handle("hibi:notion:discover-data-source", (_event, databaseId) =>
    integrationManager.discoverDataSource("notion", databaseId),
  );
  ipcMain.handle("hibi:integrations:get-settings", (_event, connectorId) =>
    connectorSettings.get(connectorId),
  );
  ipcMain.handle(
    "hibi:integrations:save-settings",
    (_event, connectorId, patch) => {
      const saved = connectorSettings.save(connectorId, patch);
      // O endpoint entra na construção do conector, então o gerenciador é refeito.
      // Isso descarta ações já preparadas de propósito: uma ação preparada contra o
      // endpoint anterior não deve ser executada contra um endpoint novo. A auditoria,
      // ao contrário, atravessa a reconstrução: `withConnectors` leva o log junto.
      if (patch?.endpoint !== undefined)
        integrationManager = integrationManager.withConnectors(
          buildConnectors(connectorSettings),
        );
      return saved;
    },
  );
  ipcMain.handle("hibi:oauth:supported", (_event, connectorId) =>
    oauthService.supports(connectorId),
  );
  ipcMain.handle("hibi:oauth:authorize", async (_event, connectorId) => {
    const result = await oauthService.authorize(connectorId, {
      clientId: connectorSettings.get(connectorId).clientId,
    });
    if (connectorId === "google-calendar" && result?.connected) {
      const targets = await integrationManager.listImportTargets(connectorId);
      connectorSettings.save(connectorId, { targets });
    }
    return result;
  });
  ipcMain.handle("hibi:oauth:refresh", (_event, connectorId) =>
    oauthService.refresh(connectorId, {
      clientId: connectorSettings.get(connectorId).clientId,
    }),
  );
  ipcMain.handle("hibi:oauth:save-client-secret", async (_event, connectorId, secret) => {
    const connector = integrationManager.getConnector(connectorId);
    if (!connector?.oauth || connectorId !== "google-calendar") throw new Error("Client secret is only supported for Google Calendar.");
    if (typeof secret !== "string" || secret.trim().length === 0 || secret.length > 8_192) throw new Error("A client secret is required.");
    await secureKeychain.set(`integration:${connectorId}:client-secret`, secret.trim());
    return { connectorId, configured: true };
  });
  ipcMain.handle("hibi:oauth:delete-client-secret", async (_event, connectorId) => {
    if (connectorId !== "google-calendar") throw new Error("Client secret is only supported for Google Calendar.");
    await secureKeychain.remove(`integration:${connectorId}:client-secret`);
    return { connectorId, configured: false };
  });
  ipcMain.handle("hibi:oauth:cancel", () => oauthService.cancel());
  ipcMain.handle("hibi:calendar-sync:state", () =>
    calendarSyncService.getState(),
  );
  ipcMain.handle("hibi:calendar-sync:request-apple-access", () =>
    calendarSyncService.requestAppleAccess(),
  );
  ipcMain.handle("hibi:calendar-sync:discover-google-calendars", () =>
    calendarSyncService.discoverGoogleCalendars(),
  );
  ipcMain.handle("hibi:calendar-sync:read-events", (_event, input) =>
    calendarSyncService.readEvents(input),
  );
  ipcMain.handle("hibi:calendar-sync:save-calendar-mode", (_event, input) =>
    calendarSyncService.saveCalendarMode(input),
  );
  ipcMain.handle("hibi:calendar-sync:prepare-publish", (_event, input) =>
    calendarSyncService.preparePublish(input),
  );
  ipcMain.handle("hibi:calendar-sync:execute-approved", (_event, input) =>
    calendarSyncService.executeApproved(input),
  );
  ipcMain.handle("hibi:calendar-sync:prepare-update", (_event, input) =>
    calendarSyncService.prepareUpdate(input),
  );
  ipcMain.handle("hibi:calendar-sync:resolve-conflict", (_event, input) =>
    calendarSyncService.resolveConflict(input),
  );
  ipcMain.handle("hibi:local-api:sync-workspace", (_event, value) => {
    const safe = value && typeof value === "object" ? value : {};
    localApiWorkspace = {
      tasks: Array.isArray(safe.tasks) ? safe.tasks.slice(0, 5_000) : [],
      reminders: Array.isArray(safe.reminders)
        ? safe.reminders.slice(0, 5_000)
        : [],
      blocks: Array.isArray(safe.blocks) ? safe.blocks.slice(0, 5_000) : [],
    };
  });
  ipcMain.handle("hibi:local-api:start", async () => {
    const started = await localApi.start();
    return { origin: started.origin };
  });
  ipcMain.handle("hibi:local-api:stop", async () => {
    await localApi.stop();
    return { running: false };
  });
  ipcMain.handle("hibi:local-api:status", () => ({
    running: localApi.isRunning(),
  }));
  ipcMain.handle("hibi:local-api:resolve-write", (_event, input) => {
    const confirmationId =
      typeof input?.confirmationId === "string" ? input.confirmationId : "";
    const intent = pendingLocalApiWrites.get(confirmationId);
    if (!intent) return { resolved: false };
    pendingLocalApiWrites.delete(confirmationId);
    return { resolved: true, approved: input?.approved === true };
  });
  ipcMain.handle("hibi:webhook:configure", async (_event, secret) => {
    await webhookService.configure(secret);
    return webhookService.status();
  });
  ipcMain.handle("hibi:webhook:start", async () => {
    await webhookService.start();
    return webhookService.status();
  });
  ipcMain.handle("hibi:webhook:stop", async () => {
    await webhookService.stop();
    return webhookService.status();
  });
  ipcMain.handle("hibi:webhook:status", () => webhookService.status());
  ipcMain.handle("hibi:notch:show", (_event, presentation) => {
    if (!isRendererPresentationAllowed(presentation))
      throw new Error("Invalid companion presentation.");
    return notchWindow.show(presentation);
  });
  ipcMain.handle("hibi:notch:hide", (_event, requestId) =>
    notchWindow.hide(typeof requestId === "string" ? requestId : ""),
  );
  ipcMain.handle(
    "hibi:notch:action",
    (_event, requestId, actionId) =>
      isValidNotchAction(requestId, actionId) &&
      notchWindow.resolveAction(requestId, actionId),
  );
  ipcMain.handle(
    "hibi:notch:current",
    () => notchWindow.activePresentation ?? null,
  );
  ipcMain.handle("hibi:notch:capabilities", () =>
    notchCapabilities(notchAdapter, notchWindow),
  );
  ipcMain.handle("hibi:notch:displays", () =>
    notchDisplayState(notchSettings, notchWindow),
  );
  ipcMain.handle("hibi:notch:set-display", (_event, displayId) =>
    applyNotchDisplay(notchSettings, notchWindow, displayId),
  );
  ipcMain.handle("hibi:notch:size", () => ({ size: notchSettings.get().size }));
  ipcMain.handle("hibi:notch:set-size", (_event, nextSize) => {
    const size = nextSize === 'compact' ? 'compact' : 'normal';
    const current = notchSettings.get();
    notchSettings.save({ ...current, size });
    notchWindow.setSize(size);
    return { size };
  });
  ipcMain.handle("hibi:notch:test", (_event, locale) =>
    notchTest.run(locale === "en" ? "en" : "pt"),
  );
  ipcMain.handle("hibi:workspace:load", () => workspaceDatabase?.load() ?? null);
  ipcMain.handle("hibi:workspace:save", (_event, data) => workspaceDatabase?.save(data) ?? data);
  ipcMain.handle("hibi:workspace:migrate-legacy", (_event, json) => workspaceDatabase?.migrateLegacy(json) ?? false);
  createWindow();
  // Aguarda a criação da janela principal para evitar uma corrida ao carregar a overlay visual.
  showStartupNotch(notchWindow, startupNotchAnimationPath);
  // Em uma versão empacotada, verifica atualizações depois que a janela já está pronta.
  // O serviço permanece desabilitado em desenvolvimento e sem feed configurado.
  if (updateService.enabled) {
    setTimeout(() => {
      void updateService.check().catch((error) => {
        console.warn("Hibi update check failed:", error?.message);
      });
    }, 3000);
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("before-quit", () => {
  detachNotchLifecycle();
  void oauthService?.cancel();
  notificationScheduler?.clear();
  presenceMonitor?.stop();
  workspaceDatabase?.close();
  void localApi?.stop();
  void webhookService?.stop();
  notchWindow?.destroy();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

module.exports = {
  isAllowedNavigation,
  isValidNotchAction,
  notchCapabilities,
  attachNotchLifecycle,
  attachRendererRecovery,
  safeAiStreamEvent,
  routeNotchAction,
  isRendererPresentationAllowed,
};

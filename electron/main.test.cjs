const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const MAIN_PATH = require.resolve("./main.cjs");
const PRELOAD_PATH = require.resolve("./preload.cjs");
const NOTCH_WINDOW_PATH = require.resolve("./notch-window.cjs");

// Carregados fora do patch de `Module._load`: os dublês reaproveitam o que é puro
// (validPresentation, NOTCH_TEST_PREFIX, o próprio agendador) e só trocam o que
// tocaria disco de verdade, rede, Keychain ou addon nativo.
const realNotifications = require("./notifications.mjs");
const realNotchWindow = require("./notch-window.cjs");
const realNotchTest = require("./notch-test.cjs");
const realAiConfig = require("./ai-config.cjs");
const realCalendarSync = require("./calendar-sync-service.cjs");
const { PRESENCE_POLL_MS } = require("./focus-presence.mjs");

// Os canais que o renderer pode chamar. A lista é mantida à mão de propósito:
// remover um handler sem mexer aqui é uma quebra de contrato com o preload.
const EXPECTED_CHANNELS = [
  "hibi:info",
  "hibi:login-item:get",
  "hibi:login-item",
  "hibi:notifications:sync",
  "hibi:notifications:test",
  "hibi:focus:watch-presence",
  "hibi:ai:run",
  "hibi:ai:cancel",
  "hibi:ai-config:get",
  "hibi:ai-config:save",
  "hibi:ai-config:delete-key",
  "hibi:integrations:list-status",
  "hibi:integrations:connect",
  "hibi:integrations:audit",
  "hibi:integrations:revoke",
  "hibi:integrations:prepare-action",
  "hibi:integrations:execute-approved",
  "hibi:integrations:test-connection",
  "hibi:integrations:import-targets",
  "hibi:integrations:import-candidates",
  "hibi:notion:discover-data-source",
  "hibi:integrations:get-settings",
  "hibi:integrations:save-settings",
  "hibi:oauth:supported",
  "hibi:oauth:authorize",
  "hibi:oauth:refresh",
  "hibi:oauth:cancel",
  "hibi:calendar-sync:state",
  "hibi:calendar-sync:request-apple-access",
  "hibi:calendar-sync:discover-google-calendars",
  "hibi:calendar-sync:read-events",
  "hibi:calendar-sync:save-calendar-mode",
  "hibi:calendar-sync:prepare-publish",
  "hibi:calendar-sync:execute-approved",
  "hibi:calendar-sync:prepare-update",
  "hibi:calendar-sync:resolve-conflict",
  "hibi:local-api:sync-workspace",
  "hibi:local-api:start",
  "hibi:local-api:stop",
  "hibi:local-api:status",
  "hibi:local-api:resolve-write",
  "hibi:webhook:configure",
  "hibi:webhook:start",
  "hibi:webhook:stop",
  "hibi:webhook:status",
  "hibi:notch:show",
  "hibi:notch:hide",
  "hibi:notch:action",
  "hibi:notch:current",
  "hibi:notch:capabilities",
  "hibi:notch:displays",
  "hibi:notch:set-display",
  "hibi:notch:test",
];

const DISPLAYS = [
  { id: 1, label: "Built-in", primary: true, internal: true, hasCameraHousing: true, width: 1512, height: 982 },
  { id: 7, label: "Studio Display", primary: false, internal: false, hasCameraHousing: false, width: 2560, height: 1440 },
];

function createKeychainFake() {
  const store = new Map();
  return {
    entries: store,
    async set(account, secret) { store.set(account, secret); },
    async has(account) { return store.has(account); },
    async get(account) {
      const secret = store.get(account);
      // Mesma recusa do Keychain real quando não há segredo gravado.
      if (typeof secret !== "string" || !secret) throw new Error("No API key is stored for this provider.");
      return secret;
    },
    async remove(account) { return store.delete(account); },
  };
}

function createSenderFake() {
  const sent = [];
  const listeners = new Map();
  return {
    sent,
    destroyed: false,
    isDestroyed() { return this.destroyed; },
    send(...args) { sent.push(args); },
    once(event, listener) { listeners.set(event, listener); },
    removeListener(event) { listeners.delete(event); },
  };
}

async function loadMain({ seedUserData } = {}) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "hibi-main-test-"));
  seedUserData?.(userData);

  const handlers = new Map();
  const duplicateChannels = [];
  const appEvents = new Map();
  const screenEvents = [];
  const powerEvents = [];
  const removedEvents = [];
  const windows = [];
  const keychain = createKeychainFake();
  const captured = {};
  let loginItem = { openAtLogin: false };
  let notificationSupported = true;
  let readyPromise = null;
  // O relógio de inatividade do sistema, e quantas vezes alguém o consultou: é assim que se prova que
  // não há polling sem sessão.
  let systemIdleSeconds = 0;
  let idleQueries = 0;

  class BrowserWindowFake {
    constructor(options) {
      this.options = options;
      this.destroyed = false;
      this.loaded = [];
      this.sent = [];
      this.reloads = 0;
      this.windowOpenHandler = null;
      this.contentListeners = new Map();
      const owner = this;
      this.webContents = {
        on: (event, listener) => { owner.contentListeners.set(event, listener); },
        send: (...args) => {
          // O Electron lança exatamente aqui quando a janela já foi destruída.
          if (owner.destroyed) throw new Error("Object has been destroyed");
          owner.sent.push(args);
        },
        setWindowOpenHandler: (handler) => { owner.windowOpenHandler = handler; },
        reloadIgnoringCache: () => { owner.reloads += 1; },
        isDestroyed: () => owner.destroyed,
      };
      windows.push(this);
    }
    isDestroyed() { return this.destroyed; }
    loadURL(url) { this.loaded.push(url); }
    loadFile(file, options) { this.loaded.push([file, options]); }
    destroy() { this.destroyed = true; }
    static getAllWindows() { return windows.filter((window) => !window.destroyed); }
  }

  const electronFake = {
    app: {
      isPackaged: true,
      getVersion: () => "1.2.3-test",
      getPath: () => userData,
      getLoginItemSettings: () => ({ ...loginItem }),
      setLoginItemSettings: (value) => { loginItem = { ...loginItem, ...value }; },
      on: (event, listener) => { appEvents.set(event, listener); },
      quit: () => { captured.quitCalls = (captured.quitCalls ?? 0) + 1; },
      whenReady: () => ({ then: (callback) => { readyPromise = Promise.resolve().then(callback); return readyPromise; } }),
    },
    BrowserWindow: BrowserWindowFake,
    ipcMain: {
      handle(channel, handler) {
        if (handlers.has(channel)) duplicateChannels.push(channel);
        handlers.set(channel, handler);
      },
    },
    Notification: class NotificationFake {
      static isSupported() { return notificationSupported; }
      constructor(options) { this.options = options; }
      show() { captured.shown = (captured.shown ?? 0) + 1; }
    },
    screen: {
      getAllDisplays: () => DISPLAYS.map((display) => ({ id: display.id, label: display.label, internal: display.internal, bounds: { x: 0, y: 0, width: display.width, height: display.height } })),
      getPrimaryDisplay: () => ({ id: 1, label: "Built-in", internal: true, bounds: { x: 0, y: 0, width: 1512, height: 982 } }),
      on: (event, listener) => { screenEvents.push([event, listener]); },
      removeListener: (event, listener) => { removedEvents.push([event, listener]); },
    },
    shell: { openExternal: () => Promise.resolve() },
    powerMonitor: {
      on: (event, listener) => { powerEvents.push([event, listener]); },
      removeListener: (event, listener) => { removedEvents.push([event, listener]); },
      getSystemIdleTime: () => { idleQueries += 1; return systemIdleSeconds; },
    },
  };

  const notchManager = {
    calls: [],
    shown: null,
    preferredDisplay: undefined,
    activePresentation: null,
    activeInteractive: false,
    diagnostics: { available: true, visible: false, displayId: 1, host: "electron" },
    show(presentation) { this.calls.push(["show", presentation]); this.shown = presentation; return { degraded: true, requestId: presentation.requestId, host: "electron" }; },
    hide(requestId) { this.calls.push(["hide", requestId]); return requestId === this.shown?.requestId; },
    resolveAction(requestId, actionId) { this.calls.push(["resolveAction", requestId, actionId]); return true; },
    setPreferredDisplay(displayId) { this.calls.push(["setPreferredDisplay", displayId]); this.preferredDisplay = displayId; },
    reposition() { this.calls.push(["reposition"]); return true; },
    describeDisplays() { return { resolvedDisplayId: 1, reason: "primary", displays: DISPLAYS.map((display) => ({ ...display })) }; },
    destroy() { this.calls.push(["destroy"]); },
  };

  const notchAdapter = {
    id: "public",
    experimental: false,
    reason: null,
    available: () => true,
    promotionAvailable: () => false,
    nativeHostAvailable: () => false,
    screenGeometry: () => [{ displayId: 1, hasCameraHousing: true }],
  };

  const localApi = {
    calls: [],
    running: false,
    async start() { this.calls.push("start"); this.running = true; return { origin: "http://127.0.0.1:41234", token: "secret-token" }; },
    async stop() { this.calls.push("stop"); this.running = false; },
    isRunning() { return this.running; },
  };
  const webhookService = {
    calls: [],
    async configure(secret) { this.calls.push(["configure", secret]); },
    async start() { this.calls.push(["start"]); },
    async stop() { this.calls.push(["stop"]); },
    status() { return { running: true, configured: true }; },
  };
  const oauthService = {
    calls: [],
    supports(id) { this.calls.push(["supports", id]); return id === "notion"; },
    async authorize(id, options) { this.calls.push(["authorize", id, options]); return { ok: true }; },
    async refresh(id, options) { this.calls.push(["refresh", id, options]); return { ok: true }; },
    async revoke(id) { this.calls.push(["revoke", id]); return { connectorId: id, connected: false, hasRefreshToken: false }; },
    async cancel() { this.calls.push(["cancel"]); return true; },
  };
  const notchTest = {
    locales: [],
    run(locale) { this.locales.push(locale); return { outcome: "confirmed", displayId: 1, displayLabel: "Built-in" }; },
    handleAction(action) { return typeof action?.requestId === "string" && action.requestId.startsWith(realNotchTest.NOTCH_TEST_PREFIX); },
  };

  const stubs = {
    electron: electronFake,
    "./local-api.cjs": {
      createLocalApiTokenStore: () => ({ getOrCreate: async () => "token", revoke: async () => true }),
      createLocalApi: (options) => { captured.localApi = options; return localApi; },
    },
    "./webhooks.cjs": { createWebhookService: () => webhookService },
    "./oauth.cjs": { createOAuthService: (options) => { captured.oauth = options; return oauthService; } },
    "./notifications.mjs": {
      ...realNotifications,
      createNotificationScheduler: (options) => {
        captured.scheduler = options;
        const scheduler = realNotifications.createNotificationScheduler(options);
        // Registra o que chega no sync de verdade: e a unica forma de provar que o handler repassa o
        // contexto do renderer, e nao so as entradas.
        const sync = scheduler.sync;
        captured.syncCalls = [];
        scheduler.sync = (entries, context) => { captured.syncCalls.push({ entries, context }); return sync(entries, context); };
        return scheduler;
      },
    },
    "./ai-config.cjs": { ...realAiConfig, createMacKeychain: () => keychain },
    // O serviço é o de verdade; o dublê só guarda as opções para provar o que o main entrega a ele.
    "./calendar-sync-service.cjs": {
      ...realCalendarSync,
      createCalendarSyncService: (options) => {
        captured.calendarSync = options;
        return realCalendarSync.createCalendarSyncService(options);
      },
    },
    "./notch-window.cjs": { ...realNotchWindow, createNotchWindowManager: (options) => { captured.notchWindow = options; return notchManager; } },
    "./notch-test.cjs": { ...realNotchTest, createNotchTest: (options) => { captured.notchTest = options; return notchTest; } },
    "../native/notch/index.cjs": { createNotchAdapter: (options) => { captured.adapter = options; return notchAdapter; } },
  };

  // `main.cjs` guarda estado de módulo, então cada harness recarrega a árvore inteira.
  for (const key of Object.keys(require.cache)) {
    if (key !== __filename && (key.startsWith(`${__dirname}${path.sep}`) || key.includes(`${path.sep}native${path.sep}notch${path.sep}`))) delete require.cache[key];
  }

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "electron") return stubs.electron;
    if (parent?.filename === MAIN_PATH && Object.hasOwn(stubs, request)) return stubs[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  let main;
  try { main = require("./main.cjs"); } finally { Module._load = originalLoad; }
  // Diferente do harness de navegação, aqui o callback de `whenReady` roda de verdade:
  // é ele que registra todos os `ipcMain.handle`.
  await readyPromise;

  const event = { sender: createSenderFake() };
  return {
    main,
    userData,
    handlers,
    duplicateChannels,
    appEvents,
    screenEvents,
    powerEvents,
    removedEvents,
    windows,
    keychain,
    captured,
    notchManager,
    notchTest,
    localApi,
    webhookService,
    oauthService,
    event,
    mainWindow: () => windows[0],
    setNotificationSupported: (value) => { notificationSupported = value; },
    setSystemIdleSeconds: (value) => { systemIdleSeconds = value; },
    idleQueries: () => idleQueries,
    // Dispara um evento de energia em todos os ouvintes vivos, como o Electron faria.
    firePower: (name) => {
      const removed = new Set(removedEvents.filter(([event]) => event === name).map(([, listener]) => listener));
      for (const [event, listener] of powerEvents) if (event === name && !removed.has(listener)) listener();
    },
    invoke: (channel, ...args) => {
      const handler = handlers.get(channel);
      assert.ok(handler, `canal não registrado: ${channel}`);
      return handler(event, ...args);
    },
    quit: () => appEvents.get("before-quit")?.(),
    cleanup() {
      // `before-quit` é o único caminho que limpa os timers do agendador; sem ele
      // uma notificação agendada seguraria o processo do teste.
      try { appEvents.get("before-quit")?.(); } catch { /* o teardown tem teste próprio */ }
      fs.rmSync(userData, { recursive: true, force: true });
    },
  };
}

test("registra exatamente os canais IPC esperados, uma única vez cada", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  assert.deepEqual([...harness.handlers.keys()].sort(), [...EXPECTED_CHANNELS].sort());
  assert.deepEqual(harness.duplicateChannels, []);
});

test("todo canal invocado pelo preload tem handler no processo principal, e vice-versa", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  const preload = fs.readFileSync(PRELOAD_PATH, "utf8");
  const invoked = new Set([...preload.matchAll(/ipcRenderer\.invoke\(\s*['"]([^'"]+)['"]/g)].map((match) => match[1]));
  assert.deepEqual([...invoked].sort(), [...harness.handlers.keys()].sort());
});

test("todo canal que o processo principal emite é escutado pelo preload", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  const preload = fs.readFileSync(PRELOAD_PATH, "utf8");
  const listened = new Set([...preload.matchAll(/ipcRenderer\.on\(\s*['"]([^'"]+)['"]/g)].map((match) => match[1]));
  const emitted = new Set([MAIN_PATH, NOTCH_WINDOW_PATH]
    .flatMap((file) => [...fs.readFileSync(file, "utf8").matchAll(/(?:sendToMainWindow|send)\(\s*['"](hibi:[^'"]+)['"]/g)].map((match) => match[1])));
  assert.deepEqual([...emitted].sort(), [...listened].sort());
});

test("a janela principal nasce isolada do Node e com a política de navegação ligada", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  const window = harness.mainWindow();
  assert.equal(window.options.webPreferences.contextIsolation, true);
  assert.equal(window.options.webPreferences.nodeIntegration, false);
  assert.equal(window.options.webPreferences.sandbox, true);
  assert.equal(window.options.webPreferences.preload, path.join(__dirname, "preload.cjs"));

  const prevented = [];
  const willNavigate = window.contentListeners.get("will-navigate");
  willNavigate({ preventDefault: () => prevented.push("https://evil.example") }, "https://evil.example");
  willNavigate({ preventDefault: () => prevented.push("http://127.0.0.1:5173/") }, "http://127.0.0.1:5173/");
  assert.deepEqual(prevented, ["https://evil.example"]);

  assert.deepEqual(window.windowOpenHandler({ url: "https://evil.example" }), { action: "deny" });
  assert.deepEqual(window.windowOpenHandler({ url: "file:///Applications/Hibi.app/index.html" }), { action: "allow" });
});

test("hibi:info devolve a versão do app e não vaza caminhos locais", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  assert.deepEqual(await harness.invoke("hibi:info"), { name: "Hibi Study Replica", version: "1.2.3-test", localOnly: true });
});

test("hibi:login-item converte qualquer payload do renderer em booleano", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  assert.equal(await harness.invoke("hibi:login-item", "sim"), true);
  assert.equal(await harness.invoke("hibi:login-item:get"), true);
  assert.equal(await harness.invoke("hibi:login-item", 0), false);
  assert.equal(await harness.invoke("hibi:login-item", { openAtLogin: true }), true);
});

test("hibi:notifications:sync descarta entradas inválidas em vez de falhar", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  await harness.invoke("hibi:notifications:sync", "não é uma lista");
  await harness.invoke("hibi:notifications:sync", [{ id: "", title: "", body: "", kind: "outro", at: "ontem" }, null, 42]);
  assert.equal(harness.captured.shown ?? 0, 0);
});

test("hibi:notifications:test respeita o suporte do sistema", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  harness.setNotificationSupported(false);
  assert.equal(await harness.invoke("hibi:notifications:test"), false);
  assert.equal(harness.captured.shown ?? 0, 0);

  harness.setNotificationSupported(true);
  assert.equal(await harness.invoke("hibi:notifications:test"), true);
  assert.equal(harness.captured.shown, 1);
});

test("uma notificação disparada não derruba o processo principal com a janela já destruída", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  const entry = { id: "r-1", kind: "reminder", title: "Revisar", body: "Bloco de estudo", at: "2026-09-11T09:00:00-03:00" };
  harness.mainWindow().destroy();
  assert.doesNotThrow(() => harness.captured.scheduler.onTrigger(entry));
});

test("hibi:ai:run recusa um correlationId fora do formato", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  const request = { message: "oi", surface: "desktop" };
  for (const correlationId of [undefined, "", 42, "com espaço", "x".repeat(129), "com/barra"]) {
    await assert.rejects(async () => harness.invoke("hibi:ai:run", { correlationId, request }), /Invalid AI correlation id/);
  }
});

test("hibi:ai:run devolve o turno correlacionado e transmite só eventos saneados", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  const result = await harness.invoke("hibi:ai:run", { correlationId: "renderer-1", request: { message: "  oi  ", surface: "desktop" } });
  assert.equal(result.correlationId, "renderer-1");
  assert.match(result.requestId, /^ai-[A-Za-z0-9-]+$/);
  assert.equal(JSON.parse(result.content).reply.length > 0, true);

  const streamed = harness.event.sender.sent.filter(([channel]) => channel === "hibi:ai:stream");
  assert.equal(streamed.length > 0, true);
  for (const [, streamEvent] of streamed) {
    assert.equal(streamEvent.correlationId, "renderer-1");
    assert.equal(streamEvent.requestId, result.requestId);
    assert.equal("apiKey" in streamEvent, false);
  }
});

test("hibi:ai:run não escreve num renderer já destruído", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  harness.event.sender.destroyed = true;
  await harness.invoke("hibi:ai:run", { correlationId: "renderer-2", request: { message: "oi", surface: "desktop" } });
  assert.deepEqual(harness.event.sender.sent, []);
});

test("hibi:ai:run recusa um turno malformado antes de chegar ao provedor", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  await assert.rejects(async () => harness.invoke("hibi:ai:run", { correlationId: "renderer-3", request: { message: "oi", surface: "browser" } }), /Invalid AI surface/);
  await assert.rejects(async () => harness.invoke("hibi:ai:run", { correlationId: "renderer-3", request: { message: "   ", surface: "desktop" } }), /Invalid AI message/);
});

test("hibi:ai:cancel ignora um payload vazio em vez de cancelar o turno de outra pessoa", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  assert.equal(await harness.invoke("hibi:ai:cancel", undefined), false);
  assert.equal(await harness.invoke("hibi:ai:cancel", {}), false);
  assert.equal(await harness.invoke("hibi:ai:cancel", { requestId: "ai-inexistente" }), false);
});

test("hibi:ai-config:save recusa uma configuração inválida e mantém o runtime anterior", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  await assert.rejects(async () => harness.invoke("hibi:ai-config:save", { provider: "qualquer" }), /Invalid AI provider/);
  await assert.rejects(async () => harness.invoke("hibi:ai-config:save", { provider: "openai-compatible", endpoint: "http://provedor.example/v1", model: "m" }), /HTTPS or local loopback/);
  assert.deepEqual(await harness.invoke("hibi:ai-config:get"), { provider: "local", endpoint: "", model: "local-tool-provider", hasApiKey: false });

  // O turno segue funcionando: a configuração recusada não trocou o runtime ativo.
  const result = await harness.invoke("hibi:ai:run", { correlationId: "renderer-4", request: { message: "oi", surface: "desktop" } });
  assert.equal(result.correlationId, "renderer-4");
});

test("trocar o endpoint de um conector preserva a auditoria e descarta as ações já preparadas", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  await harness.invoke("hibi:integrations:connect", "remote-notifications", "secret-integration-token");
  const prepared = await harness.invoke("hibi:integrations:prepare-action", { connectorId: "remote-notifications", kind: "notification.send", payload: { title: "Estudar", body: "Bloco de estudo" } });
  assert.equal(prepared.requiresConfirmation, true);

  await harness.invoke("hibi:integrations:save-settings", "remote-notifications", { endpoint: "https://notifications.example.test/v2" });

  // A auditoria atravessa a reconstrução do gerenciador; trocar `withConnectors`
  // por um `createIntegrationManager` novo apagaria estas entradas.
  const audit = await harness.invoke("hibi:integrations:audit");
  assert.deepEqual(audit.map((entry) => entry.action), ["prepare", "connect"]);

  // A ação preparada contra o endpoint anterior não pode ser executada contra o novo.
  await assert.rejects(
    async () => harness.invoke("hibi:integrations:execute-approved", { actionId: prepared.id, confirmationId: prepared.confirmationId }),
    /matching confirmation is required/,
  );
});

test("salvar ajustes sem endpoint mantém o gerenciador e a ação preparada", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  await harness.invoke("hibi:integrations:connect", "remote-notifications", "secret-integration-token");
  const prepared = await harness.invoke("hibi:integrations:prepare-action", { connectorId: "remote-notifications", kind: "notification.send", payload: { title: "Estudar", body: "Bloco de estudo" } });
  await harness.invoke("hibi:integrations:save-settings", "remote-notifications", { clientId: "cliente-1" });
  await harness.invoke("hibi:integrations:revoke", "remote-notifications");

  // A credencial some antes de qualquer chamada remota: a recusa por credencial
  // ausente prova que a ação preparada continuou registrada no mesmo gerenciador.
  await assert.rejects(
    async () => harness.invoke("hibi:integrations:execute-approved", { actionId: prepared.id, confirmationId: prepared.confirmationId }),
    /No API key is stored for this provider/,
  );
});

test("hibi:integrations:save-settings recusa um endpoint inseguro", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  await assert.rejects(async () => harness.invoke("hibi:integrations:save-settings", "notion", { endpoint: "http://notion.example.test" }), /must use HTTPS/);
  await assert.rejects(async () => harness.invoke("hibi:integrations:save-settings", "notion", { endpoint: "https://user:pass@notion.example.test" }), /must not embed credentials/);
  await assert.rejects(async () => harness.invoke("hibi:integrations:get-settings", "../etc"), /Unknown integration connector/);
});

test("hibi:integrations:connect recusa uma credencial vazia e não grava nada no Keychain", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  await assert.rejects(async () => harness.invoke("hibi:integrations:connect", "notion", ""), /credential is required/);
  await assert.rejects(async () => harness.invoke("hibi:integrations:connect", "inexistente", "token-valido"), /Unknown integration connector/);
  assert.equal(harness.keychain.entries.size, 0);
});

test("os handlers de OAuth levam o clientId configurado do conector", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  await harness.invoke("hibi:integrations:save-settings", "notion", { clientId: "cliente-1" });
  assert.equal(await harness.invoke("hibi:oauth:supported", "notion"), true);
  await harness.invoke("hibi:oauth:authorize", "notion");
  await harness.invoke("hibi:oauth:refresh", "notion");

  assert.deepEqual(harness.oauthService.calls, [
    ["supports", "notion"],
    ["authorize", "notion", { clientId: "cliente-1" }],
    ["refresh", "notion", { clientId: "cliente-1" }],
  ]);
});

test("hibi:local-api:sync-workspace normaliza e limita o que o renderer envia", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  await harness.invoke("hibi:local-api:sync-workspace", null);
  assert.deepEqual(harness.captured.localApi.workspace(), { tasks: [], reminders: [], blocks: [] });

  await harness.invoke("hibi:local-api:sync-workspace", { tasks: "muitas", reminders: [{ id: "r" }], blocks: null });
  assert.deepEqual(harness.captured.localApi.workspace(), { tasks: [], reminders: [{ id: "r" }], blocks: [] });

  await harness.invoke("hibi:local-api:sync-workspace", { tasks: Array.from({ length: 6_000 }, (_, index) => index) });
  assert.equal(harness.captured.localApi.workspace().tasks.length, 5_000);
});

test("uma escrita da API local só pode ser resolvida uma vez", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  const prepared = await harness.captured.localApi.prepareWrite({ kind: "task.create", payload: { title: "Estudar" } });
  assert.equal(prepared.requiresConfirmation, true);
  assert.match(prepared.confirmationId, /^local-api-[0-9a-f-]{36}$/);
  assert.deepEqual(harness.mainWindow().sent.at(-1), ["hibi:local-api:confirmation", { confirmationId: prepared.confirmationId, kind: "task.create", payload: { title: "Estudar" } }]);

  assert.deepEqual(await harness.invoke("hibi:local-api:resolve-write", { confirmationId: prepared.confirmationId, approved: true }), { resolved: true, approved: true });
  assert.deepEqual(await harness.invoke("hibi:local-api:resolve-write", { confirmationId: prepared.confirmationId, approved: true }), { resolved: false });
});

test("hibi:local-api:resolve-write ignora confirmações desconhecidas ou malformadas", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  const prepared = await harness.captured.localApi.prepareWrite({ kind: "task.create", payload: { title: "Estudar" } });
  assert.deepEqual(await harness.invoke("hibi:local-api:resolve-write", { confirmationId: "local-api-inventado" }), { resolved: false });
  assert.deepEqual(await harness.invoke("hibi:local-api:resolve-write", { confirmationId: 42 }), { resolved: false });
  assert.deepEqual(await harness.invoke("hibi:local-api:resolve-write", undefined), { resolved: false });
  // Só a confirmação legítima resolve, e sem aprovação implícita.
  assert.deepEqual(await harness.invoke("hibi:local-api:resolve-write", { confirmationId: prepared.confirmationId }), { resolved: true, approved: false });
});

test("uma escrita da API local não derruba o processo principal com a janela já destruída", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  harness.mainWindow().destroy();
  const prepared = await harness.captured.localApi.prepareWrite({ kind: "task.create", payload: { title: "Estudar" } });
  assert.equal(prepared.requiresConfirmation, true);
});

test("os handlers da API local e do webhook devolvem só o resumo, sem o token", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  assert.deepEqual(await harness.invoke("hibi:local-api:start"), { origin: "http://127.0.0.1:41234" });
  assert.deepEqual(await harness.invoke("hibi:local-api:status"), { running: true });
  assert.deepEqual(await harness.invoke("hibi:local-api:stop"), { running: false });
  assert.deepEqual(await harness.invoke("hibi:webhook:configure", "segredo"), { running: true, configured: true });
  assert.deepEqual(harness.webhookService.calls.at(-1), ["configure", "segredo"]);
});

test("hibi:notch:show recusa apresentações inválidas e as do prefixo reservado ao teste", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  await assert.rejects(async () => harness.invoke("hibi:notch:show", null), /Invalid companion presentation/);
  await assert.rejects(async () => harness.invoke("hibi:notch:show", { requestId: "c-1", kind: "confirmation", text: "Ok?", actions: [1, 2, 3, 4, 5] }), /Invalid companion presentation/);
  await assert.rejects(async () => harness.invoke("hibi:notch:show", { requestId: `${realNotchTest.NOTCH_TEST_PREFIX}confirm-1`, kind: "confirmation", text: "Ok?", actions: [] }), /Invalid companion presentation/);
  assert.deepEqual(harness.notchManager.calls, []);

  const presentation = { requestId: "c-1", kind: "confirmation", text: "Ok?", actions: [{ id: "confirm", label: "Ok" }] };
  assert.deepEqual(await harness.invoke("hibi:notch:show", presentation), { degraded: true, requestId: "c-1", host: "electron" });
});

test("hibi:notch:action e hibi:notch:hide só aceitam identificadores limitados", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  assert.equal(await harness.invoke("hibi:notch:action", "c-1", "apagar"), false);
  assert.equal(await harness.invoke("hibi:notch:action", "", "confirm"), false);
  assert.equal(await harness.invoke("hibi:notch:action", "x".repeat(129), "confirm"), false);
  assert.deepEqual(harness.notchManager.calls, []);

  assert.equal(await harness.invoke("hibi:notch:action", "c-1", "confirm"), true);
  assert.deepEqual(harness.notchManager.calls.at(-1), ["resolveAction", "c-1", "confirm"]);

  await harness.invoke("hibi:notch:hide", { requestId: "c-1" });
  assert.deepEqual(harness.notchManager.calls.at(-1), ["hide", ""]);
});

test("as respostas do teste do notch não chegam ao renderer", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  harness.captured.notchWindow.onAction({ requestId: `${realNotchTest.NOTCH_TEST_PREFIX}confirm-1`, actionId: "confirm" });
  assert.deepEqual(harness.mainWindow().sent, []);

  harness.captured.notchWindow.onAction({ requestId: "c-1", actionId: "cancel" });
  assert.deepEqual(harness.mainWindow().sent, [["hibi:companion:action", { requestId: "c-1", actionId: "cancel" }]]);
});

test("hibi:notch:test aceita apenas os idiomas conhecidos", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  await harness.invoke("hibi:notch:test", "en");
  await harness.invoke("hibi:notch:test", "pt");
  await harness.invoke("hibi:notch:test", "es");
  await harness.invoke("hibi:notch:test", undefined);
  assert.deepEqual(harness.notchTest.locales, ["en", "pt", "pt", "pt"]);
});

test("hibi:notch:set-display recusa um monitor inexistente e persiste o escolhido", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  await assert.rejects(async () => harness.invoke("hibi:notch:set-display", 99), /Invalid notch display/);
  await assert.rejects(async () => harness.invoke("hibi:notch:set-display", "7"), /Invalid notch display/);
  assert.equal(harness.notchManager.preferredDisplay, undefined);

  const state = await harness.invoke("hibi:notch:set-display", 7);
  assert.deepEqual(state.preference, { displayId: 7, displayLabel: "Studio Display" });
  assert.equal(harness.notchManager.preferredDisplay, 7);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(harness.userData, "notch-settings.json"), "utf8")), { displayId: 7, displayLabel: "Studio Display" });
});

test("a preferência de monitor salva chega ao gerenciador na inicialização", async (t) => {
  const harness = await loadMain({ seedUserData: (userData) => fs.writeFileSync(path.join(userData, "notch-settings.json"), JSON.stringify({ displayId: 7, displayLabel: "Studio Display" })) });
  t.after(() => harness.cleanup());

  assert.equal(harness.captured.notchWindow.preferredDisplayId, 7);
});

test("hibi:notch:capabilities reúne o adaptador e o diagnóstico do host", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  assert.deepEqual(await harness.invoke("hibi:notch:capabilities"), {
    adapter: "public",
    experimental: false,
    reason: null,
    bridgeLoaded: true,
    nativePromotion: false,
    nativeHost: false,
    screens: [{ displayId: 1, hasCameraHousing: true }],
    host: { available: true, visible: false, displayId: 1, host: "electron" },
  });
  assert.equal(await harness.invoke("hibi:notch:current"), null);
});

test("uma mudança de monitores reposiciona a companion e avisa a janela principal", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  const [, listener] = harness.screenEvents.find(([name]) => name === "display-added");
  listener();

  assert.deepEqual(harness.notchManager.calls.at(-1), ["reposition"]);
  assert.deepEqual(harness.mainWindow().sent.at(-1), ["hibi:notch:displays-changed"]);
});

test("before-quit encerra serviços, solta os listeners e destrói a companion", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  await harness.invoke("hibi:local-api:start");
  harness.quit();

  assert.deepEqual(harness.localApi.calls, ["start", "stop"]);
  assert.deepEqual(harness.webhookService.calls, [["stop"]]);
  assert.deepEqual(harness.oauthService.calls, [["cancel"]]);
  assert.deepEqual(harness.notchManager.calls.at(-1), ["destroy"]);
  assert.deepEqual(harness.removedEvents.map(([event]) => event), ["display-added", "display-removed", "display-metrics-changed", "resume"]);
});

// A tela de Foco so cumpre "lembretes ficam quietos durante o foco" se os ajustes e a janela da sessao
// atravessarem a ponte inteira: renderer -> preload -> handler -> agendador. Os testes do agendador o
// chamam direto, entao sem estes dois uma ponte que voltasse a repassar so as entradas desligaria o
// silencio no app real com a suite inteira verde.
test("hibi:notifications:sync entrega ao agendador os ajustes e a janela de foco do renderer", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  const context = { settings: { sessionMinutes: 25, activeStart: "08:00", activeEnd: "18:00", nudgePreset: "work" }, focusUntilMs: 1_900_000_000_000 };
  await harness.invoke("hibi:notifications:sync", [], context);
  assert.deepEqual(harness.captured.syncCalls.at(-1)?.context, context);
});

// Carrega o `preload.cjs` de verdade com o `electron` dublado e devolve a API exposta ao renderer,
// o que ele invocou e os ouvintes que registrou por canal.
function loadPreload() {
  const exposed = {};
  const invoked = [];
  const listeners = new Map();
  const electronStub = {
    contextBridge: { exposeInMainWorld: (key, api) => { exposed[key] = api; } },
    ipcRenderer: {
      invoke: (...args) => { invoked.push(args); return Promise.resolve(); },
      on: (channel, listener) => { listeners.set(channel, [...(listeners.get(channel) ?? []), listener]); },
      removeListener: (channel, listener) => { listeners.set(channel, (listeners.get(channel) ?? []).filter((item) => item !== listener)); },
      send() {},
    },
  };
  delete require.cache[PRELOAD_PATH];
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "electron" && parent?.filename === PRELOAD_PATH) return electronStub;
    return originalLoad.call(this, request, parent, isMain);
  };
  try { require(PRELOAD_PATH); } finally { Module._load = originalLoad; delete require.cache[PRELOAD_PATH]; }
  const deliver = (channel, ...args) => { for (const listener of listeners.get(channel) ?? []) listener({ sender: null }, ...args); };
  return { api: exposed.hibiDesktop, invoked, listeners, deliver };
}

test("preload repassa os ajustes e a janela de foco junto das entradas", () => {
  const { api, invoked } = loadPreload();
  const exposed = { hibiDesktop: api };

  const entries = [{ id: "reminder:1" }];
  const context = { settings: { sessionMinutes: 25, activeStart: "09:00", activeEnd: "17:00", nudgePreset: "work" }, focusUntilMs: 123 };
  exposed.hibiDesktop.syncNotifications(entries, context);
  assert.deepEqual(invoked.at(-1), ["hibi:notifications:sync", entries, context]);
});

// Presença durante o foco. O relógio e o intervalo são dublados com `t.mock.timers` ANTES de carregar o
// processo principal: é o `setInterval` global que o monitor arma, e o `Date.now()` que ele carimba.
const PRESENCE_CHANNEL = "hibi:focus:presence";
const PRESENCE_START_MS = 1_800_000_000_000;
const presenceSent = (harness) => harness.mainWindow().sent.filter(([channel]) => channel === PRESENCE_CHANNEL).map(([, event]) => event);
const POWER_PRESENCE_EVENTS = ["lock-screen", "suspend", "unlock-screen", "resume"];

test("presença: sem sessão de foco não há polling nem ouvinte de bloqueio e sono", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"], now: PRESENCE_START_MS });
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  harness.setSystemIdleSeconds(3_600);
  t.mock.timers.tick(PRESENCE_POLL_MS * 30);
  assert.equal(harness.idleQueries(), 0);
  // O único ouvinte de energia é o `resume` do notch, que já existia.
  assert.deepEqual(harness.powerEvents.map(([event]) => event), ["resume"]);
  assert.deepEqual(presenceSent(harness), []);

  // Um pedido malformado não liga nada.
  await harness.invoke("hibi:focus:watch-presence", "sim");
  await harness.invoke("hibi:focus:watch-presence", { watching: "true", idleMinutes: 5 });
  t.mock.timers.tick(PRESENCE_POLL_MS * 3);
  assert.equal(harness.idleQueries(), 0);

  // A sessão começa, com a pessoa ali: consulta a cada intervalo. A sessão acaba: para de consultar e
  // solta os ouvintes — e a hora de teclado parado que vem depois não vira evento.
  harness.setSystemIdleSeconds(0);
  assert.deepEqual(await harness.invoke("hibi:focus:watch-presence", { watching: true, idleMinutes: 5 }), { watching: true });
  t.mock.timers.tick(PRESENCE_POLL_MS * 2);
  assert.equal(harness.idleQueries(), 2);
  assert.deepEqual(await harness.invoke("hibi:focus:watch-presence", { watching: false, idleMinutes: 5 }), { watching: false });
  harness.setSystemIdleSeconds(3_600);
  t.mock.timers.tick(PRESENCE_POLL_MS * 30);
  assert.equal(harness.idleQueries(), 2);
  assert.deepEqual(harness.removedEvents.map(([event]) => event).sort(), [...POWER_PRESENCE_EVENTS].sort());
  // Uma ausência de 1 hora sem sessão nunca virou evento.
  assert.deepEqual(presenceSent(harness), []);
});

test("presença: inatividade acima do limiar durante a sessão emite ausência, e o retorno emite retorno", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"], now: PRESENCE_START_MS });
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  await harness.invoke("hibi:focus:watch-presence", { watching: true, idleMinutes: 5 });
  harness.setSystemIdleSeconds(299);
  t.mock.timers.tick(PRESENCE_POLL_MS);
  assert.deepEqual(presenceSent(harness), [], "abaixo do limiar não há ausência");

  harness.setSystemIdleSeconds(300);
  t.mock.timers.tick(PRESENCE_POLL_MS);
  const awayAtMs = Date.now();
  assert.deepEqual(presenceSent(harness), [{ type: "away", reason: "idle", idleSeconds: 300, atMs: awayAtMs }]);

  // Seguir ocioso não repete o aviso.
  harness.setSystemIdleSeconds(310);
  t.mock.timers.tick(PRESENCE_POLL_MS);
  assert.equal(presenceSent(harness).length, 1);

  harness.setSystemIdleSeconds(1);
  t.mock.timers.tick(PRESENCE_POLL_MS);
  assert.deepEqual(presenceSent(harness).at(-1), { type: "returned", reason: "idle", awaySeconds: 300 + 20, atMs: awayAtMs + PRESENCE_POLL_MS * 2 });
});

test("presença: bloquear a tela e dormir contam como ausência por energia, e a volta só vem com a tela desbloqueada", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"], now: PRESENCE_START_MS });
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  // Sem sessão, bloquear a tela não é assunto de ninguém.
  harness.firePower("lock-screen");
  assert.deepEqual(presenceSent(harness), []);

  await harness.invoke("hibi:focus:watch-presence", { watching: true, idleMinutes: 5 });
  harness.setSystemIdleSeconds(40);
  harness.firePower("lock-screen");
  assert.deepEqual(presenceSent(harness), [{ type: "away", reason: "power", idleSeconds: 40, atMs: PRESENCE_START_MS }]);

  harness.firePower("suspend");
  t.mock.timers.tick(3_600_000);
  harness.firePower("resume");
  assert.equal(presenceSent(harness).length, 1, "acordou, mas ainda está na tela de senha");

  harness.firePower("unlock-screen");
  assert.deepEqual(presenceSent(harness).at(-1), { type: "returned", reason: "power", awaySeconds: 40 + 3_600, atMs: PRESENCE_START_MS + 3_600_000 });
});

test("before-quit desliga a vigia de presença junto dos outros serviços", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"], now: PRESENCE_START_MS });
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  await harness.invoke("hibi:focus:watch-presence", { watching: true, idleMinutes: 1 });
  harness.quit();
  harness.setSystemIdleSeconds(600);
  t.mock.timers.tick(PRESENCE_POLL_MS * 10);
  assert.equal(harness.idleQueries(), 0);
  assert.deepEqual(presenceSent(harness), []);
});

// Os testes acima param no `webContents.send` do processo principal. Este leva o MESMO evento, pelo
// MESMO canal, através do `preload.cjs` real até o callback que o renderer registrou — e o pedido de
// vigia do renderer de volta até o handler registrado no `whenReady`.
test("o evento de presença atravessa a ponte: processo principal → preload → renderer, e a vigia volta", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"], now: PRESENCE_START_MS });
  const harness = await loadMain();
  t.after(() => harness.cleanup());
  const preload = loadPreload();

  const received = [];
  const unsubscribe = preload.api.onFocusPresence((event) => received.push(event));

  // Renderer pede vigia pela ponte; o pedido chega ao handler do processo principal.
  preload.api.watchFocusPresence({ watching: true, idleMinutes: 1 });
  const [channel, request] = preload.invoked.at(-1);
  assert.equal(channel, "hibi:focus:watch-presence");
  assert.deepEqual(await harness.invoke(channel, request), { watching: true });

  harness.setSystemIdleSeconds(60);
  t.mock.timers.tick(PRESENCE_POLL_MS);
  const emitted = harness.mainWindow().sent.filter(([sentChannel]) => sentChannel === PRESENCE_CHANNEL);
  assert.equal(emitted.length, 1);
  for (const [sentChannel, ...args] of emitted) preload.deliver(sentChannel, ...args);
  assert.deepEqual(received, [{ type: "away", reason: "idle", idleSeconds: 60, atMs: PRESENCE_START_MS + PRESENCE_POLL_MS }]);

  // Lixo no canal não chega ao renderer, e cancelar a assinatura solta o ouvinte de verdade.
  preload.deliver(PRESENCE_CHANNEL, null);
  assert.equal(received.length, 1);
  unsubscribe();
  assert.deepEqual(preload.listeners.get(PRESENCE_CHANNEL), []);
  preload.deliver(PRESENCE_CHANNEL, emitted[0][1]);
  assert.equal(received.length, 1);
});

test("os canais de sincronização de calendário respondem a entrada malformada com erro de validação, nunca TypeError", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());
  const channels = [
    "hibi:calendar-sync:save-calendar-mode",
    "hibi:calendar-sync:prepare-publish",
    "hibi:calendar-sync:execute-approved",
    "hibi:calendar-sync:prepare-update",
    "hibi:calendar-sync:resolve-conflict",
  ];
  const inputs = [
    undefined,
    null,
    "apple:personal",
    42,
    [],
    { calendarId: 7, block: "bloco" },
    { calendarId: "apple:personal", block: { id: "b", title: "T", startsAt: "amanhã", endsAt: "2026-09-14T10:00:00" } },
    { id: {}, mode: ["bidirectional"], choice: null, actionId: [], confirmationId: {} },
  ];

  for (const channel of channels)
    for (const input of inputs)
      await assert.rejects(
        () => harness.invoke(channel, input),
        (error) => {
          assert.ok(!(error instanceof TypeError), `${channel} ${JSON.stringify(input)}: ${error.message}`);
          assert.match(error.message, /invalid|required/i, `${channel} ${JSON.stringify(input)}`);
          return true;
        },
      );
  assert.equal(fs.existsSync(path.join(harness.userData, "calendar-sync.json")), false);
});

test("a sincronização de calendário não vê workspace até o renderer mandar um", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());

  assert.equal(harness.captured.calendarSync.workspace(), null);
  await harness.invoke("hibi:local-api:sync-workspace", { tasks: [], reminders: [], blocks: [{ id: "block-1" }] });
  assert.deepEqual(harness.captured.calendarSync.workspace().blocks, [{ id: "block-1" }]);
});

test("revogar uma integração com OAuth apaga também o refresh token guardado", async (t) => {
  const harness = await loadMain();
  t.after(() => harness.cleanup());
  await harness.invoke("hibi:integrations:connect", "notion", "token-de-teste");
  await harness.invoke("hibi:integrations:connect", "slack", "token-de-teste");

  const notion = await harness.invoke("hibi:integrations:revoke", "notion");
  const slack = await harness.invoke("hibi:integrations:revoke", "slack");

  assert.equal(notion.state, "disconnected");
  assert.equal(slack.state, "disconnected");
  // Só o conector com OAuth passa pelo serviço de OAuth; o token manual do Slack sai pelo gerenciador.
  assert.deepEqual(harness.oauthService.calls.filter(([name]) => name === "revoke"), [["revoke", "notion"]]);
  assert.equal(harness.keychain.entries.has("integration:notion"), false);
});

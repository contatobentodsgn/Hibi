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
const realNotifications = require("./notifications.cjs");
const realNotchWindow = require("./notch-window.cjs");
const realNotchTest = require("./notch-test.cjs");
const realAiConfig = require("./ai-config.cjs");

// Os canais que o renderer pode chamar. A lista é mantida à mão de propósito:
// remover um handler sem mexer aqui é uma quebra de contrato com o preload.
const EXPECTED_CHANNELS = [
  "hibi:info",
  "hibi:login-item:get",
  "hibi:login-item",
  "hibi:notifications:sync",
  "hibi:notifications:test",
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
    "./notifications.cjs": {
      ...realNotifications,
      createNotificationScheduler: (options) => { captured.scheduler = options; return realNotifications.createNotificationScheduler(options); },
    },
    "./ai-config.cjs": { ...realAiConfig, createMacKeychain: () => keychain },
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

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "electron") {
    return {
      app: { isPackaged: true, whenReady: () => ({ then() {} }), on() {}, getVersion() { return "test"; } },
      BrowserWindow: { getAllWindows() { return []; } },
      ipcMain: { handle() {} },
      Notification: {},
    };
  }
  if (request === "./notifications.cjs") return { createNotificationScheduler() { return { clear() {} }; } };
  return originalLoad.call(this, request, parent, isMain);
};
const { isAllowedNavigation, isValidNotchAction, notchCapabilities, attachNotchLifecycle } = require("./main.cjs");
Module._load = originalLoad;

test("allows only local development and packaged file navigation", () => {
  assert.equal(isAllowedNavigation("http://127.0.0.1:5173/"), true);
  assert.equal(isAllowedNavigation("http://localhost:4173/settings"), true);
  assert.equal(isAllowedNavigation("file:///Applications/Hibi.app/Contents/Resources/dist/index.html"), true);

  assert.equal(isAllowedNavigation("https://example.com/"), false);
  assert.equal(isAllowedNavigation("http://192.168.1.20:5173/"), false);
  assert.equal(isAllowedNavigation("data:text/html,<h1>nope</h1>"), false);
  assert.equal(isAllowedNavigation("not a URL"), false);
});

test('allows only bounded confirmation action payloads', () => {
  assert.equal(isValidNotchAction('confirm-1', 'confirm'), true);
  assert.equal(isValidNotchAction('confirm-1', 'cancel'), true);
  assert.equal(isValidNotchAction('', 'confirm'), false);
  assert.equal(isValidNotchAction('x'.repeat(129), 'confirm'), false);
  assert.equal(isValidNotchAction('confirm-1', 'delete'), false);
});

test('reports the active native host through the narrow capabilities payload', () => {
  const result = notchCapabilities({
    id: 'public', experimental: false, reason: null,
    available: () => true, promotionAvailable: () => true,
    nativeHostAvailable: () => true, screenGeometry: () => [{ displayId: 7 }],
  }, { diagnostics: { available: true, visible: true, displayId: 7, host: 'native' } });

  assert.deepEqual(result, {
    adapter: 'public', experimental: false, reason: null, bridgeLoaded: true,
    nativePromotion: true, nativeHost: true, screens: [{ displayId: 7 }],
    host: { available: true, visible: true, displayId: 7, host: 'native' },
  });
});

test('repositions the companion after display changes and wake then unregisters listeners', () => {
  const registered = [];
  const removed = [];
  const eventSource = { on: (event, listener) => registered.push([event, listener]), removeListener: (event, listener) => removed.push([event, listener]) };
  let calls = 0;
  const detach = attachNotchLifecycle({ displayService: eventSource, powerService: eventSource, manager: { reposition: () => { calls += 1; } } });

  assert.deepEqual(registered.map(([event]) => event), ['display-added', 'display-removed', 'display-metrics-changed', 'resume']);
  for (const [, listener] of registered) listener();
  assert.equal(calls, 4);
  detach();
  assert.deepEqual(removed.map(([event]) => event), ['display-added', 'display-removed', 'display-metrics-changed', 'resume']);
});

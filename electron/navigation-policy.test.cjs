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
const { isAllowedNavigation } = require("./main.cjs");
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

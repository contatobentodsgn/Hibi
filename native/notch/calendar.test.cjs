const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const bridge = require("./calendar.cjs");

test("exposes a bounded EventKit calendar bridge contract", () => {
  for (const method of [
    "available",
    "authorizationStatus",
    "requestFullAccess",
    "listCalendars",
    "listEvents",
    "saveEvent",
    "updateEvent",
    "removeEvent",
  ]) {
    assert.equal(typeof bridge[method], "function");
  }
});

test("declares the calendar usage text for every macOS version the addon supports", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf8"));
  const info = manifest.build?.mac?.extendInfo ?? {};
  const gyp = fs.readFileSync(path.join(__dirname, "binding.gyp"), "utf8");
  const target = /"target_name": "hibi_calendar".*?"MACOSX_DEPLOYMENT_TARGET": "(\d+)/.exec(gyp);
  assert.ok(target, "hibi_calendar precisa declarar o macOS minimo");
  // O macOS 14 lê a chave FullAccess. No 13, pedir acesso sem NSCalendarsUsageDescription encerra o app.
  assert.equal(typeof info.NSCalendarsFullAccessUsageDescription, "string");
  assert.ok(info.NSCalendarsFullAccessUsageDescription.trim().length > 0);
  if (Number(target[1]) < 14) {
    assert.equal(typeof info.NSCalendarsUsageDescription, "string");
    assert.ok(info.NSCalendarsUsageDescription.trim().length > 0);
  }
});

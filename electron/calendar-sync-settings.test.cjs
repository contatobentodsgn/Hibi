const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createCalendarSyncSettings } = require("./calendar-sync-settings.cjs");

test("stores calendar modes and safe source sync state with owner-only file permissions", () => {
  const folder = fs.mkdtempSync(
    path.join(os.tmpdir(), "hibi-calendar-settings-"),
  );
  const filePath = path.join(folder, "calendar-sync.json");
  const settings = createCalendarSyncSettings({ filePath });

  settings.save({
    calendars: [
      { id: "apple:personal", mode: "bidirectional" },
      { id: "google:work", mode: "read-only" },
    ],
    sources: [{ id: "apple", lastSyncedAt: "2026-09-14T10:00:00.000Z" }],
    links: [
      {
        localId: "block-1",
        calendarId: "google:work",
        remoteId: "event-1",
        remoteRevision: "revision-1",
        localFingerprint: "a".repeat(64),
      },
    ],
    conflicts: [
      {
        id: "google:work:event-1",
        calendarId: "google:work",
        kind: "concurrent-update",
        summary: "Planejar",
      },
    ],
  });

  assert.deepEqual(settings.get(), {
    calendars: [
      { id: "apple:personal", mode: "bidirectional" },
      { id: "google:work", mode: "read-only" },
    ],
    sources: [{ id: "apple", lastSyncedAt: "2026-09-14T10:00:00.000Z" }],
    links: [
      {
        localId: "block-1",
        calendarId: "google:work",
        remoteId: "event-1",
        remoteRevision: "revision-1",
        localFingerprint: "a".repeat(64),
      },
    ],
    conflicts: [
      {
        id: "google:work:event-1",
        calendarId: "google:work",
        kind: "concurrent-update",
        summary: "Planejar",
      },
    ],
  });
  assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
});

test("rejects malformed calendar selection instead of persisting it", () => {
  const folder = fs.mkdtempSync(
    path.join(os.tmpdir(), "hibi-calendar-settings-"),
  );
  const settings = createCalendarSyncSettings({
    filePath: path.join(folder, "calendar-sync.json"),
  });

  assert.throws(
    () =>
      settings.save({ calendars: [{ id: "../../bad", mode: "write-only" }] }),
    /Calendar sync settings are invalid/,
  );
  assert.deepEqual(settings.get(), {
    calendars: [],
    sources: [],
    links: [],
    conflicts: [],
  });
});

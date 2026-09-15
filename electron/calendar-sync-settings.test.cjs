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
    pending: [],
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
    pending: [],
  });
});

const tempSettings = (clock) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "hibi-calendar-settings-"));
  const filePath = path.join(folder, "calendar-sync.json");
  return { folder, filePath, settings: createCalendarSyncSettings({ filePath, clock }) };
};
const minimal = { calendars: [{ id: "apple:personal", mode: "bidirectional" }] };

test("sets an unreadable settings file aside instead of letting the next save erase it", () => {
  for (const content of ["{not json", JSON.stringify({ calendars: "nope" })]) {
    const { folder, filePath, settings } = tempSettings(() => 1_700_000_000_000);
    fs.writeFileSync(filePath, content, { mode: 0o644 });

    assert.deepEqual(settings.get(), { calendars: [], sources: [], links: [], conflicts: [], pending: [] });
    const aside = `${filePath}.invalid-1700000000000`;
    assert.equal(fs.readFileSync(aside, "utf8"), content);
    assert.equal(fs.statSync(aside).mode & 0o777, 0o600);

    settings.save(minimal);
    assert.equal(fs.readFileSync(aside, "utf8"), content);
    assert.deepEqual(settings.get().calendars, minimal.calendars);
    assert.deepEqual(fs.readdirSync(folder).sort(), ["calendar-sync.json", "calendar-sync.json.invalid-1700000000000"]);
  }
});

test("replaces the settings file atomically and leaves no temporary file behind", () => {
  const { folder, filePath, settings } = tempSettings();
  settings.save(minimal);
  const before = fs.statSync(filePath).ino;

  settings.save({ ...minimal, sources: [{ id: "apple", lastSyncedAt: "2026-09-15T10:00:00.000Z" }] });

  assert.notEqual(fs.statSync(filePath).ino, before);
  assert.deepEqual(fs.readdirSync(folder), ["calendar-sync.json"]);
  assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
});

test("round-trips remote windows, pending publishes and the revision a conflict saw", () => {
  const { settings } = tempSettings();
  const links = Array.from({ length: 201 }, (_, index) => ({
    localId: `block-${index}`,
    calendarId: "google:work",
    remoteId: `event-${index}`,
    remoteRevision: "revision-1",
    localFingerprint: "b".repeat(64),
    ...(index === 0 ? { remoteStartsAt: "2026-09-15T09:00:00+14:00", remoteEndsAt: "2026-09-15T10:00:00+14:00" } : {}),
  }));
  const saved = settings.save({
    ...minimal,
    links,
    conflicts: [{ id: "google:work:event-0", calendarId: "google:work", kind: "concurrent-update", summary: "Planejar", remoteRevision: "revision-2" }],
    pending: [{ localId: "block-9", calendarId: "google:work", startedAt: "2026-09-15T10:00:00.000Z", eventId: "0123456789abcdefghijklmnopqrstuv" }],
  });

  assert.equal(settings.get().links.length, 201);
  assert.deepEqual(settings.get(), saved);
  assert.equal(settings.get().links[0].remoteStartsAt, "2026-09-15T09:00:00+14:00");
  assert.equal(settings.get().conflicts[0].remoteRevision, "revision-2");
  assert.throws(() => settings.save({ ...minimal, pending: [{ localId: "b", calendarId: "google:work", startedAt: "2026-09-15T10:00:00.000Z", eventId: "Not_Base32" }] }), /invalid/);
  assert.throws(() => settings.save({ ...minimal, links: [{ ...links[1], remoteStartsAt: "2026-09-15T09:00:00Z" }] }), /invalid/);
});

const fs = require("node:fs");
const path = require("node:path");

const MAX_CALENDARS = 200;
const isCalendarId = (value) =>
  typeof value === "string" && /^(apple|google):[^\s/]{1,240}$/.test(value);
const isMode = (value) =>
  value === "disabled" || value === "read-only" || value === "bidirectional";
const isSourceId = (value) => value === "apple" || value === "google";
const isIso = (value) =>
  typeof value === "string" && !Number.isNaN(Date.parse(value));
const isText = (value, maximum = 240) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= maximum;

function normalize(value) {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray(value.calendars) ||
    value.calendars.length > MAX_CALENDARS
  )
    throw new Error("Calendar sync settings are invalid.");
  const seen = new Set();
  const calendars = value.calendars.map((entry) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      !isCalendarId(entry.id) ||
      !isMode(entry.mode) ||
      seen.has(entry.id)
    )
      throw new Error("Calendar sync settings are invalid.");
    seen.add(entry.id);
    return { id: entry.id, mode: entry.mode };
  });
  if (
    value.sources !== undefined &&
    (!Array.isArray(value.sources) || value.sources.length > 2)
  )
    throw new Error("Calendar sync settings are invalid.");
  const sourceIds = new Set();
  const sources = (value.sources ?? []).map((entry) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      !isSourceId(entry.id) ||
      sourceIds.has(entry.id) ||
      !isIso(entry.lastSyncedAt)
    )
      throw new Error("Calendar sync settings are invalid.");
    sourceIds.add(entry.id);
    return { id: entry.id, lastSyncedAt: entry.lastSyncedAt };
  });
  if (
    value.links !== undefined &&
    (!Array.isArray(value.links) || value.links.length > MAX_CALENDARS)
  )
    throw new Error("Calendar sync settings are invalid.");
  const linkIds = new Set();
  const links = (value.links ?? []).map((entry) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      !isText(entry.localId) ||
      !isCalendarId(entry.calendarId) ||
      !isText(entry.remoteId) ||
      !isText(entry.remoteRevision) ||
      typeof entry.localFingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(entry.localFingerprint) ||
      linkIds.has(`${entry.calendarId}:${entry.remoteId}`)
    )
      throw new Error("Calendar sync settings are invalid.");
    linkIds.add(`${entry.calendarId}:${entry.remoteId}`);
    return {
      localId: entry.localId,
      calendarId: entry.calendarId,
      remoteId: entry.remoteId,
      remoteRevision: entry.remoteRevision,
      localFingerprint: entry.localFingerprint,
    };
  });
  if (
    value.conflicts !== undefined &&
    (!Array.isArray(value.conflicts) || value.conflicts.length > MAX_CALENDARS)
  )
    throw new Error("Calendar sync settings are invalid.");
  const conflictIds = new Set();
  const conflicts = (value.conflicts ?? []).map((entry) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      !isText(entry.id) ||
      !isCalendarId(entry.calendarId) ||
      !["concurrent-update", "remote-deleted"].includes(entry.kind) ||
      !isText(entry.summary) ||
      conflictIds.has(entry.id)
    )
      throw new Error("Calendar sync settings are invalid.");
    conflictIds.add(entry.id);
    return {
      id: entry.id,
      calendarId: entry.calendarId,
      kind: entry.kind,
      summary: entry.summary,
    };
  });
  return { calendars, sources, links, conflicts };
}

function createCalendarSyncSettings({ filePath } = {}) {
  if (
    typeof filePath !== "string" ||
    !filePath.trim() ||
    filePath.length > 4096
  )
    throw new Error("A calendar sync settings file path is required.");
  const get = () => {
    try {
      return normalize(JSON.parse(fs.readFileSync(filePath, "utf8")));
    } catch {
      return { calendars: [], sources: [], links: [], conflicts: [] };
    }
  };
  return {
    get,
    save(value) {
      const next = normalize(value);
      fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
      fs.writeFileSync(filePath, JSON.stringify(next), {
        encoding: "utf8",
        mode: 0o600,
      });
      fs.chmodSync(filePath, 0o600);
      return next;
    },
  };
}

module.exports = { createCalendarSyncSettings, normalize };

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const MAX_CALENDARS = 200;
// Um vínculo por bloco publicado, e o workspace aceita até 5.000 blocos. Com o teto antigo de 200, o
// 201º vínculo fazia `normalize` lançar e nenhuma sincronização gravava mais nada.
const MAX_LINKS = 5_000;
const MAX_CONFLICTS = 5_000;
const MAX_PENDING = 200;
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
const isInstantText = (value) => isText(value, 64) && isIso(value);
const isGoogleEventId = (value) =>
  typeof value === "string" && /^[a-v0-9]{5,64}$/.test(value);
const empty = () => ({
  calendars: [],
  sources: [],
  links: [],
  conflicts: [],
  pending: [],
});
const invalid = () => new Error("Calendar sync settings are invalid.");
const boundedList = (value, maximum) => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maximum) throw invalid();
  return value;
};
const isEntry = (entry) => entry && typeof entry === "object";

function normalize(value) {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray(value.calendars) ||
    value.calendars.length > MAX_CALENDARS
  )
    throw invalid();
  const seen = new Set();
  const calendars = value.calendars.map((entry) => {
    if (
      !isEntry(entry) ||
      !isCalendarId(entry.id) ||
      !isMode(entry.mode) ||
      seen.has(entry.id)
    )
      throw invalid();
    seen.add(entry.id);
    return { id: entry.id, mode: entry.mode };
  });
  const sourceIds = new Set();
  const sources = boundedList(value.sources, 2).map((entry) => {
    if (
      !isEntry(entry) ||
      !isSourceId(entry.id) ||
      sourceIds.has(entry.id) ||
      !isIso(entry.lastSyncedAt)
    )
      throw invalid();
    sourceIds.add(entry.id);
    return { id: entry.id, lastSyncedAt: entry.lastSyncedAt };
  });
  const linkIds = new Set();
  const links = boundedList(value.links, MAX_LINKS).map((entry) => {
    const hasWindow =
      entry?.remoteStartsAt !== undefined || entry?.remoteEndsAt !== undefined;
    if (
      !isEntry(entry) ||
      !isText(entry.localId) ||
      !isCalendarId(entry.calendarId) ||
      !isText(entry.remoteId) ||
      !isText(entry.remoteRevision) ||
      typeof entry.localFingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(entry.localFingerprint) ||
      (hasWindow &&
        (!isInstantText(entry.remoteStartsAt) ||
          !isInstantText(entry.remoteEndsAt))) ||
      linkIds.has(`${entry.calendarId}:${entry.remoteId}`)
    )
      throw invalid();
    linkIds.add(`${entry.calendarId}:${entry.remoteId}`);
    return {
      localId: entry.localId,
      calendarId: entry.calendarId,
      remoteId: entry.remoteId,
      remoteRevision: entry.remoteRevision,
      localFingerprint: entry.localFingerprint,
      ...(hasWindow
        ? { remoteStartsAt: entry.remoteStartsAt, remoteEndsAt: entry.remoteEndsAt }
        : {}),
    };
  });
  const conflictIds = new Set();
  const conflicts = boundedList(value.conflicts, MAX_CONFLICTS).map((entry) => {
    if (
      !isEntry(entry) ||
      !isText(entry.id) ||
      !isCalendarId(entry.calendarId) ||
      !["concurrent-update", "remote-deleted"].includes(entry.kind) ||
      !isText(entry.summary) ||
      (entry.remoteRevision !== undefined && !isText(entry.remoteRevision)) ||
      conflictIds.has(entry.id)
    )
      throw invalid();
    conflictIds.add(entry.id);
    return {
      id: entry.id,
      calendarId: entry.calendarId,
      kind: entry.kind,
      summary: entry.summary,
      ...(entry.remoteRevision !== undefined
        ? { remoteRevision: entry.remoteRevision }
        : {}),
    };
  });
  const pendingIds = new Set();
  const pending = boundedList(value.pending, MAX_PENDING).map((entry) => {
    if (
      !isEntry(entry) ||
      !isText(entry.localId) ||
      !isCalendarId(entry.calendarId) ||
      !isInstantText(entry.startedAt) ||
      (entry.eventId !== undefined && !isGoogleEventId(entry.eventId)) ||
      pendingIds.has(`${entry.calendarId}:${entry.localId}`)
    )
      throw invalid();
    pendingIds.add(`${entry.calendarId}:${entry.localId}`);
    return {
      localId: entry.localId,
      calendarId: entry.calendarId,
      startedAt: entry.startedAt,
      ...(entry.eventId !== undefined ? { eventId: entry.eventId } : {}),
    };
  });
  return { calendars, sources, links, conflicts, pending };
}

function createCalendarSyncSettings({ filePath, clock = () => Date.now() } = {}) {
  if (
    typeof filePath !== "string" ||
    !filePath.trim() ||
    filePath.length > 4096
  )
    throw new Error("A calendar sync settings file path is required.");
  const get = () => {
    let text;
    try {
      text = fs.readFileSync(filePath, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") return empty();
      // Sem ler não dá para saber o que há ali; devolver vazio faria o próximo save apagar tudo.
      throw new Error("Calendar sync settings could not be read.");
    }
    try {
      return normalize(JSON.parse(text));
    } catch {
      // Um arquivo inválido não pode virar estado vazio que o próximo save sobrescreve em silêncio.
      // Ele fica ao lado, com a mesma permissão restrita, e a sincronização recomeça do zero.
      const aside = `${filePath}.invalid-${clock()}`;
      try {
        fs.renameSync(filePath, aside);
        fs.chmodSync(aside, 0o600);
      } catch {
        throw new Error("Calendar sync settings are invalid and could not be set aside.");
      }
      return empty();
    }
  };
  return {
    get,
    save(value) {
      const next = normalize(value);
      fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
      // Grava num arquivo temporário e troca de uma vez: uma queda no meio nunca deixa JSON pela metade.
      const temporary = `${filePath}.${process.pid}-${crypto.randomUUID()}.tmp`;
      try {
        const descriptor = fs.openSync(temporary, "wx", 0o600);
        try {
          fs.writeFileSync(descriptor, JSON.stringify(next), "utf8");
          fs.fsyncSync(descriptor);
        } finally {
          fs.closeSync(descriptor);
        }
        fs.chmodSync(temporary, 0o600);
        fs.renameSync(temporary, filePath);
      } catch (error) {
        fs.rmSync(temporary, { force: true });
        throw error;
      }
      return next;
    },
  };
}

module.exports = { createCalendarSyncSettings, normalize };

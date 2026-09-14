const fs = require('node:fs');
const path = require('node:path');

const MAX_CALENDARS = 200;
const isCalendarId = (value) => typeof value === 'string' && /^(apple|google):[^\s/]{1,240}$/.test(value);
const isMode = (value) => value === 'disabled' || value === 'read-only' || value === 'bidirectional';
const isSourceId = (value) => value === 'apple' || value === 'google';
const isIso = (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value));

function normalize(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.calendars) || value.calendars.length > MAX_CALENDARS) throw new Error('Calendar sync settings are invalid.');
  const seen = new Set();
  const calendars = value.calendars.map((entry) => {
    if (!entry || typeof entry !== 'object' || !isCalendarId(entry.id) || !isMode(entry.mode) || seen.has(entry.id)) throw new Error('Calendar sync settings are invalid.');
    seen.add(entry.id);
    return { id: entry.id, mode: entry.mode };
  });
  if (value.sources !== undefined && (!Array.isArray(value.sources) || value.sources.length > 2)) throw new Error('Calendar sync settings are invalid.');
  const sourceIds = new Set();
  const sources = (value.sources ?? []).map((entry) => {
    if (!entry || typeof entry !== 'object' || !isSourceId(entry.id) || sourceIds.has(entry.id) || !isIso(entry.lastSyncedAt)) throw new Error('Calendar sync settings are invalid.');
    sourceIds.add(entry.id);
    return { id: entry.id, lastSyncedAt: entry.lastSyncedAt };
  });
  return { calendars, sources };
}

function createCalendarSyncSettings({ filePath } = {}) {
  if (typeof filePath !== 'string' || !filePath.trim() || filePath.length > 4096) throw new Error('A calendar sync settings file path is required.');
  const get = () => {
    try { return normalize(JSON.parse(fs.readFileSync(filePath, 'utf8'))); } catch { return { calendars: [], sources: [] }; }
  };
  return {
    get,
    save(value) {
      const next = normalize(value);
      fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
      fs.writeFileSync(filePath, JSON.stringify(next), { encoding: 'utf8', mode: 0o600 });
      fs.chmodSync(filePath, 0o600);
      return next;
    },
  };
}

module.exports = { createCalendarSyncSettings, normalize };

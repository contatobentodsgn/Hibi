const fs = require('node:fs');
const path = require('node:path');

const MAX_DISPLAY_ID = 4_294_967_295;
const MAX_LABEL = 120;
const defaults = () => ({ displayId: null, displayLabel: '' });

function normalizeNotchSettings(value) {
  if (!value || typeof value !== 'object') throw new Error('Invalid notch settings.');
  if (value.displayId === null) return defaults();
  if (!Number.isInteger(value.displayId) || value.displayId < 1 || value.displayId > MAX_DISPLAY_ID) throw new Error('Invalid notch settings.');
  if (value.displayLabel !== undefined && typeof value.displayLabel !== 'string') throw new Error('Invalid notch settings.');
  return { displayId: value.displayId, displayLabel: (value.displayLabel ?? '').trim().slice(0, MAX_LABEL) };
}

function createNotchSettings({ filePath } = {}) {
  if (typeof filePath !== 'string' || !filePath.trim()) throw new Error('A notch settings file path is required.');
  return {
    filePath,
    get() {
      try { return normalizeNotchSettings(JSON.parse(fs.readFileSync(filePath, 'utf8'))); } catch { return defaults(); }
    },
    save(value) {
      const next = normalizeNotchSettings(value);
      fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
      fs.writeFileSync(filePath, JSON.stringify(next), { encoding: 'utf8', mode: 0o600 });
      fs.chmodSync(filePath, 0o600);
      return next;
    },
  };
}

function notchDisplayState(settings, manager) {
  return { preference: settings.get(), ...manager.describeDisplays() };
}

// Só aceita um monitor conectado agora: o rótulo salvo é o que a tela mostra quando ele sai.
function applyNotchDisplay(settings, manager, displayId) {
  if (displayId === null) {
    settings.save({ displayId: null });
    manager.setPreferredDisplay(null);
    return notchDisplayState(settings, manager);
  }
  const target = Number.isInteger(displayId) ? manager.describeDisplays().displays.find((display) => display.id === displayId) : undefined;
  if (!target) throw new Error('Invalid notch display.');
  settings.save({ displayId: target.id, displayLabel: target.label });
  manager.setPreferredDisplay(target.id);
  return notchDisplayState(settings, manager);
}

module.exports = { createNotchSettings, normalizeNotchSettings, notchDisplayState, applyNotchDisplay };

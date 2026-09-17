const fsDefault = require('node:fs');
const path = require('node:path');

/** The app is called Hibi everywhere except in the folder Electron derives from the package name. */
const APP_FOLDER = 'Hibi';
const LEGACY_FOLDER = 'hibi-study-replica';

function modifiedAt(fs, target) {
  try {
    return fs.statSync(target).mtimeMs;
  } catch {
    return 0;
  }
}

function exists(fs, target) {
  try {
    return fs.existsSync(target);
  } catch {
    return false;
  }
}

/**
 * Decides which folder holds this person's data and moves the old one into place once.
 *
 * Nothing is ever deleted: a folder that loses the dispute is renamed aside, keeping every file
 * where a person can find it. If the move fails for any reason, the app keeps opening the folder
 * it already used instead of starting empty.
 */
function resolveUserDataPath({ appData, fs = fsDefault, now = () => new Date(), onNotice = () => {} } = {}) {
  const target = path.join(appData, APP_FOLDER);
  const legacy = path.join(appData, LEGACY_FOLDER);
  const hasTarget = exists(fs, target);
  const hasLegacy = exists(fs, legacy);
  if (!hasLegacy) return target;
  if (hasTarget && modifiedAt(fs, target) >= modifiedAt(fs, legacy)) {
    onNotice({ kind: 'kept', path: target, other: legacy });
    return target;
  }
  try {
    if (hasTarget) {
      const supersededAt = now().toISOString().replace(/[:.]/g, '-');
      const aside = `${target}.superseded-${supersededAt}`;
      fs.renameSync(target, aside);
      onNotice({ kind: 'superseded', path: aside });
    }
    fs.renameSync(legacy, target);
    onNotice({ kind: 'migrated', path: target, other: legacy });
    return target;
  } catch (error) {
    onNotice({ kind: 'failed', path: legacy, error: error instanceof Error ? error.message : String(error) });
    return exists(fs, legacy) ? legacy : target;
  }
}

module.exports = { resolveUserDataPath, APP_FOLDER, LEGACY_FOLDER };

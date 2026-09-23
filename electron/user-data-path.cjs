const fsDefault = require('node:fs');
const path = require('node:path');

/** Pixano é o nome visível; estes dois diretórios são preservados como caminhos de migração. */
const APP_FOLDER = 'Pixano';
const LEGACY_FOLDER = 'Hibi';
const LEGACY_PACKAGE_FOLDER = 'hibi-study-replica';
const LEGACY_FOLDERS = [LEGACY_FOLDER, LEGACY_PACKAGE_FOLDER];

function exists(fs, target) {
  try {
    return fs.existsSync(target);
  } catch {
    return false;
  }
}

/** Any non-empty app-data folder is user state; this includes pre-database preferences. */
function hasWorkspace(fs, folder) {
  if (exists(fs, path.join(folder, 'workspace.db')) || exists(fs, path.join(folder, 'Local Storage'))) return true;
  try {
    return fs.readdirSync(folder).length > 0;
  } catch {
    return false;
  }
}

/**
 * Move the first usable legacy profile into Pixano once. Never overwrite or delete a profile:
 * an empty Pixano directory is preserved beside the migrated one, and any other legacy directory
 * remains untouched for manual recovery if it also contains data.
 */
function resolveUserDataPath({ appData, override, fs = fsDefault, now = () => new Date(), onNotice = () => {} } = {}) {
  if (override !== undefined) {
    if (typeof override !== 'string' || !path.isAbsolute(override)) throw new TypeError('The explicit user-data path must be absolute.');
    return path.normalize(override);
  }

  const target = path.join(appData, APP_FOLDER);
  const hasTarget = exists(fs, target);
  const legacyPaths = LEGACY_FOLDERS.map((folder) => path.join(appData, folder));
  const hasLegacy = legacyPaths.some((folder) => exists(fs, folder));
  if (!hasLegacy) return target;

  if (hasTarget && hasWorkspace(fs, target)) {
    onNotice({ kind: 'kept', path: target, other: legacyPaths.find((folder) => exists(fs, folder)) });
    return target;
  }

  const source = legacyPaths.find((folder) => exists(fs, folder) && hasWorkspace(fs, folder));
  if (!source) {
    if (hasTarget) onNotice({ kind: 'kept', path: target, other: legacyPaths.find((folder) => exists(fs, folder)) });
    return target;
  }

  try {
    if (hasTarget) {
      const supersededAt = now().toISOString().replace(/[:.]/g, '-');
      const aside = `${target}.superseded-${supersededAt}`;
      fs.renameSync(target, aside);
      onNotice({ kind: 'superseded', path: aside });
    }
    fs.renameSync(source, target);
    onNotice({ kind: 'migrated', path: target, other: source });
    return target;
  } catch (error) {
    onNotice({ kind: 'failed', path: source, error: error instanceof Error ? error.message : String(error) });
    return exists(fs, source) ? source : target;
  }
}

module.exports = { resolveUserDataPath, APP_FOLDER, LEGACY_FOLDER, LEGACY_PACKAGE_FOLDER };

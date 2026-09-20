const fsDefault = require('node:fs');
const path = require('node:path');

/** The app is called Hibi everywhere except in the folder Electron derives from the package name. */
const APP_FOLDER = 'Hibi';
const LEGACY_FOLDER = 'hibi-study-replica';

function exists(fs, target) {
  try {
    return fs.existsSync(target);
  } catch {
    return false;
  }
}

/**
 * Uma pasta "tem dados" quando guarda um workspace: o banco, ou o armazenamento local de antes dele.
 * A data da pasta não serve: ela muda quando um arquivo é criado dentro dela, não quando o banco é
 * regravado — e um app antigo que recriasse a pasta legada a faria parecer a mais nova.
 */
function hasWorkspace(fs, folder) {
  return exists(fs, path.join(folder, 'workspace.db')) || exists(fs, path.join(folder, 'Local Storage'));
}

/**
 * Decide qual pasta guarda os dados desta pessoa e move a antiga para o lugar uma vez.
 *
 * A regra de ouro: **a pasta com o nome do app, tendo dados, nunca é trocada.** Antes, a escolha
 * comparava a data das pastas, e qualquer build antigo (ou a branch de outra pessoa rodando em
 * desenvolvimento) que recriasse `hibi-study-replica` a fazia parecer mais nova: na abertura seguinte
 * a pasta verdadeira era posta de lado e o app abria vazio. A pasta antiga só entra quando a do app
 * não tem workspace nenhum — e nada é apagado: quem perde a disputa é renomeado ao lado.
 */
function resolveUserDataPath({ appData, fs = fsDefault, now = () => new Date(), onNotice = () => {} } = {}) {
  const target = path.join(appData, APP_FOLDER);
  const legacy = path.join(appData, LEGACY_FOLDER);
  const hasTarget = exists(fs, target);
  const hasLegacy = exists(fs, legacy);
  if (!hasLegacy) return target;
  if (hasTarget && (hasWorkspace(fs, target) || !hasWorkspace(fs, legacy))) {
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

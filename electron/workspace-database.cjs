const fs = require("node:fs");
const path = require("node:path");

// O workspace inteiro em JSON. O teto existe para um arquivo corrompido ou um payload absurdo não virar
// uma gravação de gigabytes; o maior workspace real cabe em poucos megabytes.
const MAX_PAYLOAD_BYTES = 32 * 1024 * 1024;
const MAX_RESTORE_POINTS = 20;
const MIGRATION_LABEL = "data.restorePoint.migration";
const MAX_LABEL = 120;
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS restore_points (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
`;
const boundedText = (value, maximum) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= maximum;

/**
 * O workspace do Hibi num banco SQLite, com pontos de restauração.
 *
 * Por que SQLite e não um arquivo JSON: uma gravação parcial no meio de uma escrita grande perde o
 * workspace inteiro, e é exatamente o que o `localStorage` e o backup manual deixam acontecer. Aqui cada
 * gravação é uma transação: ou entra inteira, ou não entra. O ponto de restauração guarda o estado
 * ANTERIOR à gravação, que é o que serve para desfazer um lote ou uma migração que deu errado.
 */
function createWorkspaceDatabase({
  filePath,
  sqlite = () => require("node:sqlite"),
  now = () => new Date().toISOString(),
  maxRestorePoints = MAX_RESTORE_POINTS,
} = {}) {
  if (!boundedText(filePath, 4096)) throw new Error("A workspace database path is required.");
  if (!Number.isInteger(maxRestorePoints) || maxRestorePoints < 1)
    throw new Error("The restore point limit is invalid.");

  let DatabaseSync;
  try {
    ({ DatabaseSync } = sqlite());
  } catch (error) {
    throw new Error(`SQLite is unavailable in this runtime: ${error instanceof Error ? error.message : "unknown"}`);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const database = new DatabaseSync(filePath);
  // WAL sobrevive a uma queda no meio da escrita; o timeout evita erro imediato quando duas janelas
  // gravam ao mesmo tempo.
  database.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  database.exec(SCHEMA);
  // O banco carrega o workspace inteiro: ninguém além do dono lê.
  for (const suffix of ["", "-wal", "-shm"])
    try {
      fs.chmodSync(`${filePath}${suffix}`, 0o600);
    } catch {
      /* -wal e -shm só existem depois da primeira escrita */
    }

  const readWorkspace = database.prepare("SELECT payload, updated_at AS updatedAt FROM workspace WHERE id = 1");
  const writeWorkspace = database.prepare(
    "INSERT INTO workspace (id, payload, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at",
  );
  const insertRestorePoint = database.prepare("INSERT INTO restore_points (label, payload, created_at) VALUES (?, ?, ?)");
  const listPoints = database.prepare(
    "SELECT id, label, created_at AS createdAt, length(payload) AS bytes FROM restore_points ORDER BY id DESC",
  );
  const readPoint = database.prepare("SELECT payload FROM restore_points WHERE id = ?");
  const prunePoints = database.prepare(
    "DELETE FROM restore_points WHERE id NOT IN (SELECT id FROM restore_points ORDER BY id DESC LIMIT ?)",
  );

  const validPayload = (payload) => {
    if (typeof payload !== "string" || payload.length === 0) return false;
    if (Buffer.byteLength(payload, "utf8") > MAX_PAYLOAD_BYTES) return false;
    try {
      const parsed = JSON.parse(payload);
      // O workspace é um objeto; lista, número ou texto soltos são dado errado, não workspace.
      return Boolean(parsed) && typeof parsed === "object" && !Array.isArray(parsed);
    } catch {
      return false;
    }
  };
  const keepRestorePoint = (label, incoming) => {
    const current = readWorkspace.get();
    // Sem workspace gravado ainda não há estado anterior para guardar. A migração é a exceção: o banco
    // está vazio por definição, e o ponto guarda o que veio do armazenamento local. Antes nenhum ponto
    // era criado, e o registro do app dizia que a migração tinha um.
    const payload = current?.payload ?? (label === MIGRATION_LABEL ? incoming : null);
    if (!payload) return null;
    const created = now();
    insertRestorePoint.run(label, payload, created);
    prunePoints.run(maxRestorePoints);
    return created;
  };

  return {
    /** O workspace guardado, ou `null` quando o banco ainda está vazio. */
    read() {
      const row = readWorkspace.get();
      return row ? { payload: row.payload, updatedAt: row.updatedAt } : null;
    },

    /**
     * Grava o workspace. Com `restorePoint`, o estado ANTERIOR vira ponto de restauração antes da troca:
     * é assim que um lote ou uma migração fica desfazível.
     */
    save(payload, { restorePoint } = {}) {
      if (!validPayload(payload)) throw new Error("The workspace payload is invalid.");
      if (restorePoint !== undefined && !boundedText(restorePoint, MAX_LABEL))
        throw new Error("The restore point label is invalid.");
      const at = now();
      database.exec("BEGIN IMMEDIATE");
      try {
        if (restorePoint !== undefined) keepRestorePoint(restorePoint, payload);
        writeWorkspace.run(payload, at);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      return { updatedAt: at };
    },

    listRestorePoints() {
      return listPoints.all().map((row) => ({ id: row.id, label: row.label, createdAt: row.createdAt, bytes: row.bytes }));
    },

    /**
     * Volta o workspace a um ponto guardado. O estado atual vira um ponto novo antes da troca, para que
     * restaurar não seja o caminho sem volta.
     */
    restore(id) {
      if (!Number.isInteger(id) || id < 1) throw new Error("The restore point is invalid.");
      const at = now();
      database.exec("BEGIN IMMEDIATE");
      try {
        const point = readPoint.get(id);
        if (!point) throw new Error("This restore point is unavailable.");
        keepRestorePoint("data.restorePoint.beforeRollback");
        writeWorkspace.run(point.payload, at);
        database.exec("COMMIT");
        return { payload: point.payload, updatedAt: at };
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },

    close() {
      database.close();
    },
  };
}

module.exports = { MAX_PAYLOAD_BYTES, MAX_RESTORE_POINTS, createWorkspaceDatabase };

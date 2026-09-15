const fs = require('node:fs');
const path = require('node:path');

function sqlite() {
  try { return require('node:sqlite'); } catch (error) { throw new Error(`SQLite is unavailable in this runtime: ${error.message}`); }
}

function createWorkspaceDatabase({ filePath }) {
  if (typeof filePath !== 'string' || !filePath.trim()) throw new TypeError('A workspace database path is required.');
  const { DatabaseSync } = sqlite();
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filePath);
  fs.chmodSync(filePath, 0o600);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL, updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS restore_points (id INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT NOT NULL, created_at TEXT NOT NULL);');
  const loadRow = db.prepare('SELECT payload FROM workspace WHERE id = 1');
  const saveRow = db.prepare('INSERT INTO workspace (id, payload, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at');
  const restoreRow = db.prepare('INSERT INTO restore_points (payload, created_at) VALUES (?, ?)');
  return {
    filePath,
    load() { const row = loadRow.get(); return row ? JSON.parse(row.payload) : null; },
    save(value) {
      const payload = JSON.stringify(value);
      const current = loadRow.get();
      db.exec('BEGIN IMMEDIATE');
      try { if (current) restoreRow.run(current.payload, new Date().toISOString()); saveRow.run(payload, new Date().toISOString()); db.exec('COMMIT'); }
      catch (error) { db.exec('ROLLBACK'); throw error; }
      return value;
    },
    migrateLegacy(json) { if (loadRow.get()) return false; const value = JSON.parse(json); saveRow.run(JSON.stringify(value), new Date().toISOString()); return true; },
    listRestorePoints() { return db.prepare('SELECT id, created_at AS createdAt FROM restore_points ORDER BY id DESC').all(); },
    restore(id) {
      const row = db.prepare('SELECT payload FROM restore_points WHERE id = ?').get(id);
      if (!row) throw new Error('Restore point not found.');
      const current = loadRow.get();
      db.exec('BEGIN IMMEDIATE');
      try {
        if (current) restoreRow.run(current.payload, new Date().toISOString());
        saveRow.run(row.payload, new Date().toISOString());
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      return JSON.parse(row.payload);
    },
    close() { db.close(); },
  };
}

module.exports = { createWorkspaceDatabase };

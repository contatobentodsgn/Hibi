const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createWorkspaceDatabase } = require('./workspace-database.cjs');

const tempDb = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hibi-workspace-'));
  return { filePath: path.join(directory, 'workspace.sqlite'), cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) };
};

test('persiste o workspace e cria restore point antes de substituir', () => {
  const { filePath, cleanup } = tempDb();
  const database = createWorkspaceDatabase({ filePath });
  const first = { tasks: [{ id: 'a' }], blocks: [], reminders: [], notes: [], habits: [], goals: [], telemetry: [], activity: [] };
  const second = { ...first, tasks: [{ id: 'b' }] };
  assert.equal(database.load(), null);
  database.save(first);
  database.save(second);
  assert.deepEqual(database.load(), second);
  const restorePoints = database.listRestorePoints();
  assert.equal(restorePoints.length, 1);
  assert.deepEqual(database.restore(restorePoints[0].id), first);
  database.close();
  cleanup();
});

test('cria restore point do estado atual antes de restaurar um estado anterior', () => {
  const { filePath, cleanup } = tempDb();
  const database = createWorkspaceDatabase({ filePath });
  const first = { tasks: [{ id: 'first' }] };
  const second = { tasks: [{ id: 'second' }] };
  database.save(first);
  database.save(second);
  const restoreId = database.listRestorePoints()[0].id;

  database.restore(restoreId);

  assert.deepEqual(database.load(), first);
  assert.equal(database.listRestorePoints().length, 2);
  database.close();
  cleanup();
});

test('migra o JSON legado apenas quando o banco ainda está vazio', () => {
  const { filePath, cleanup } = tempDb();
  const database = createWorkspaceDatabase({ filePath });
  const legacy = { tasks: [{ id: 'legacy' }], blocks: [], reminders: [], notes: [], habits: [], goals: [], telemetry: [], activity: [] };
  assert.equal(database.migrateLegacy(JSON.stringify(legacy)), true);
  assert.deepEqual(database.load(), legacy);
  assert.equal(database.migrateLegacy(JSON.stringify({ ...legacy, tasks: [] })), false);
  database.close();
  cleanup();
});

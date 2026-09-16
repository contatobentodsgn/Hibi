const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createWorkspaceDatabase } = require("./workspace-database.cjs");

const workspaceFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "hibi-workspace-db-")), "workspace.db");
const payloadWith = (...tasks) => JSON.stringify({ tasks, reminders: [], blocks: [] });
// Um banco real, com a escrita do workspace falhando sob comando: é como se prova que a gravação é
// uma transação, e não duas escritas soltas.
const sqliteFailingWorkspaceWrite = (shouldFail) => () => {
  const real = require("node:sqlite");
  return {
    DatabaseSync: function (file) {
      const database = new real.DatabaseSync(file);
      return {
        exec: (sql) => database.exec(sql),
        close: () => database.close(),
        prepare(sql) {
          const statement = database.prepare(sql);
          if (!sql.startsWith("INSERT INTO workspace")) return statement;
          return {
            run: (...args) => {
              if (shouldFail()) throw new Error("disco cheio");
              return statement.run(...args);
            },
            get: (...args) => statement.get(...args),
            all: (...args) => statement.all(...args),
          };
        },
      };
    },
  };
};

test("guarda e devolve o workspace, num arquivo só do dono", () => {
  const filePath = workspaceFile();
  const database = createWorkspaceDatabase({ filePath, now: () => "2026-09-16T10:00:00.000Z" });

  assert.equal(database.read(), null);
  assert.deepEqual(database.save(payloadWith("estudar")), { updatedAt: "2026-09-16T10:00:00.000Z" });

  assert.deepEqual(database.read(), { payload: payloadWith("estudar"), updatedAt: "2026-09-16T10:00:00.000Z" });
  assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
  database.close();
});

test("o ponto de restauração guarda o estado anterior, e não o que está entrando", () => {
  const database = createWorkspaceDatabase({ filePath: workspaceFile(), now: () => "2026-09-16T11:00:00.000Z" });
  database.save(payloadWith("antes"));

  database.save(payloadWith("depois"), { restorePoint: "importação" });

  const [point] = database.listRestorePoints();
  assert.equal(point.label, "importação");
  assert.equal(point.createdAt, "2026-09-16T11:00:00.000Z");
  assert.equal(database.restore(point.id).payload, payloadWith("antes"));
  database.close();
});

test("sem pedir, nenhuma gravação cria ponto de restauração", () => {
  const database = createWorkspaceDatabase({ filePath: workspaceFile() });

  database.save(payloadWith("um"));
  database.save(payloadWith("dois"));

  assert.deepEqual(database.listRestorePoints(), []);
  database.close();
});

test("o teto descarta os pontos mais antigos, mantendo os recentes", () => {
  let clock = 0;
  const database = createWorkspaceDatabase({ filePath: workspaceFile(), maxRestorePoints: 3, now: () => `2026-09-16T12:00:0${clock++}.000Z` });
  database.save(payloadWith("zero"));

  for (const label of ["um", "dois", "três", "quatro", "cinco"]) database.save(payloadWith(label), { restorePoint: label });

  assert.deepEqual(database.listRestorePoints().map((point) => point.label), ["cinco", "quatro", "três"]);
  database.close();
});

test("restaurar volta o payload guardado e guarda o estado atual antes", () => {
  const database = createWorkspaceDatabase({ filePath: workspaceFile() });
  database.save(payloadWith("original"));
  database.save(payloadWith("migrado"), { restorePoint: "migração" });
  const [point] = database.listRestorePoints();

  const restored = database.restore(point.id);

  assert.equal(restored.payload, payloadWith("original"));
  assert.equal(database.read().payload, payloadWith("original"));
  // O estado de antes da restauração continua alcançável: restaurar não é caminho sem volta.
  const labels = database.listRestorePoints().map((entry) => entry.label);
  assert.deepEqual(labels, ["before-restore", "migração"]);
  assert.equal(database.restore(database.listRestorePoints()[0].id).payload, payloadWith("migrado"));
  database.close();
});

test("recusa payload que não seja um objeto JSON, e rótulo inválido", () => {
  const database = createWorkspaceDatabase({ filePath: workspaceFile() });
  database.save(payloadWith("válido"));

  for (const invalid of ["", "não é json", "[]", '"texto"', "42", "null", undefined, 42, { tasks: [] }])
    assert.throws(() => database.save(invalid), /payload is invalid/);
  for (const label of ["", "   ", "x".repeat(121), 42])
    assert.throws(() => database.save(payloadWith("outro"), { restorePoint: label }), /label is invalid/);
  for (const id of [0, -1, 1.5, "1", undefined]) assert.throws(() => database.restore(id), /restore point is invalid/);
  assert.throws(() => database.restore(9_999), /unavailable/);

  assert.equal(database.read().payload, payloadWith("válido"));
  assert.deepEqual(database.listRestorePoints(), []);
  database.close();
});

test("uma gravação que falha no meio não deixa ponto de restauração para trás", () => {
  let failing = false;
  const database = createWorkspaceDatabase({ filePath: workspaceFile(), sqlite: sqliteFailingWorkspaceWrite(() => failing) });
  database.save(payloadWith("antes"));

  failing = true;
  assert.throws(() => database.save(payloadWith("depois"), { restorePoint: "lote" }), /disco cheio/);

  failing = false;
  assert.deepEqual(database.listRestorePoints(), []);
  assert.equal(database.read().payload, payloadWith("antes"));
  database.close();
});

test("os dados sobrevivem a fechar e reabrir o arquivo, com WAL ligado", () => {
  const filePath = workspaceFile();
  const first = createWorkspaceDatabase({ filePath });
  first.save(payloadWith("persistido"), { restorePoint: "inicial" });
  first.close();

  const second = createWorkspaceDatabase({ filePath });

  assert.equal(second.read().payload, payloadWith("persistido"));
  assert.equal(second.listRestorePoints().length, 0);
  assert.equal(fs.existsSync(`${filePath}-wal`), true);
  second.close();
});

test("recusa caminho ausente, teto inválido e runtime sem SQLite", () => {
  for (const filePath of [undefined, "", "   ", 42, "x".repeat(4_097)])
    assert.throws(() => createWorkspaceDatabase({ filePath }), /database path is required/);
  assert.throws(() => createWorkspaceDatabase({ filePath: workspaceFile(), maxRestorePoints: 0 }), /limit is invalid/);
  assert.throws(
    () => createWorkspaceDatabase({ filePath: workspaceFile(), sqlite: () => { throw new Error("sem node:sqlite"); } }),
    /SQLite is unavailable/,
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// A suíte do processo principal é declarada por padrões no `package.json`. Um arquivo de teste que não
// casa com nenhum padrão nunca roda, nem aqui nem na CI, e o defeito que ele pegaria passa batido.
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const patterns = [...manifest.scripts.test.matchAll(/'([^']+)'/g)]
  .map(([, pattern]) => pattern)
  .filter((pattern) => pattern.includes(".test."));
const COVERED_DIRECTORIES = ["electron", "native/notch", "scripts"];

const walk = (directory) =>
  fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) return [];
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return walk(relative);
    return /\.test\.(c|m)?js$/.test(entry.name) ? [relative] : [];
  });

test("every main-process test file is covered by the suite patterns", () => {
  const declared = new Set(patterns.flatMap((pattern) => fs.globSync(pattern, { cwd: root })).map((file) => file.split(path.sep).join("/")));
  const found = COVERED_DIRECTORIES.flatMap(walk);
  assert.ok(found.length > 0);
  const orphans = found.filter((file) => !declared.has(file));
  assert.deepEqual(orphans, [], `arquivos de teste fora da suíte: ${orphans.join(", ")}`);
});

test("the suite covers both module formats in every main-process directory", () => {
  for (const directory of COVERED_DIRECTORIES)
    for (const extension of ["cjs", "mjs"])
      assert.ok(
        patterns.some((pattern) => pattern.startsWith(directory) && pattern.endsWith(`.test.${extension}`)),
        `${directory} não roda testes .${extension}`,
      );
});

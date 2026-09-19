import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OUTPUT, readInstalledPreflight, scopedPreflight } from './scoped-preflight.mjs';

test('o reset da nova UI é o do Tailwind instalado, só dentro de .hibi-ui', () => {
  const { preflight, version } = readInstalledPreflight();
  assert.equal(readFileSync(OUTPUT, 'utf8'), scopedPreflight(preflight, version), 'rode `node scripts/scoped-preflight.mjs` depois de atualizar o Tailwind');
});

test('a raiz do reset passa a ser a .hibi-ui, e nada fica fora do escopo', () => {
  const css = scopedPreflight('*,\n::after {\n  margin: 0;\n}\n\nhtml,\n:host {\n  line-height: 1.5;\n}\n', '0.0.0');
  assert.match(css, /@scope \(\.hibi-ui\) \{/);
  assert.match(css, /:scope \{\n\s+line-height: 1\.5;/);
  assert.doesNotMatch(css, /^\s*html,/m);
});

test('um preflight sem a raiz conhecida é recusado, em vez de gerar um reset sem escopo', () => {
  assert.throws(() => scopedPreflight('body { margin: 0; }', '0.0.0'), /mudou de forma/);
});

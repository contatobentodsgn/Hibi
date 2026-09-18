import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

// Sem isto o app empacotado nasce sem saber qual modelo baixar.
test('o manifesto do modelo viaja dentro do app empacotado', () => {
  const extra = JSON.parse(readFileSync(`${root}package.json`, 'utf8')).build?.extraResources ?? [];
  const entrada = extra.find((item) => item.to === 'local-models/manifest.json');

  assert.ok(entrada, 'o manifesto precisa estar em build.extraResources');
  assert.ok(existsSync(`${root}${entrada.from}`), `${entrada.from} precisa existir no repositório`);
});

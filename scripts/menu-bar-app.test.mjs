import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

// Sem esta chave o ícone pisca no Dock a cada abertura, antes de o processo conseguir escondê-lo.
test('o app empacotado nasce como app de barra de menus, sem passar pelo Dock', () => {
  const extendInfo = JSON.parse(readFileSync(`${root}package.json`, 'utf8')).build?.mac?.extendInfo ?? {};

  assert.equal(extendInfo.LSUIElement, true);
});

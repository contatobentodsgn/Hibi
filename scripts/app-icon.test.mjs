import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

// O ícone do app sai de build/icon (compilado por `npm run icon:build`) e precisa chegar ao pacote: o
// .icns para macOS antigos, o Assets.car com as versões clara e escura, e o nome que liga um ao outro.
test('o pacote do mac leva o ícone do Hibi, nas duas formas, com o nome que o catálogo usa', () => {
  const mac = pkg.build.mac;
  assert.equal(mac.icon, 'build/icon/icon.icns');
  assert.ok(existsSync(join(root, mac.icon)), mac.icon);
  const catalog = pkg.build.extraResources.find((entry) => entry.to === 'Assets.car');
  assert.ok(catalog && existsSync(join(root, catalog.from)), 'Assets.car nos recursos');
  assert.equal(mac.extendInfo.CFBundleIconName, 'Hibi');
});

test('o ícone de origem tem as duas aparências, e a barra de menus usa imagem-modelo', () => {
  const icon = JSON.parse(readFileSync(join(root, 'build/icon/Hibi.icon/icon.json'), 'utf8'));
  const layers = icon.groups.flatMap((group) => group.layers);
  assert.deepEqual(layers.map((layer) => layer['image-name']).sort(), ['cat-dark.svg', 'cat-light.svg']);
  for (const layer of layers) assert.ok(existsSync(join(root, 'build/icon/Hibi.icon/Assets', layer['image-name'])));
  assert.ok(icon['fill-specializations'].some((entry) => entry.appearance === 'dark'));
  for (const name of ['hibi-trayTemplate.png', 'hibi-trayTemplate@2x.png']) assert.ok(existsSync(join(root, 'public/companion-assets/tray', name)), name);
});

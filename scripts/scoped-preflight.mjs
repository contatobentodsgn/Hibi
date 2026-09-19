import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * O reset do Tailwind (preflight) só dentro de `.hibi-ui`.
 *
 * A nova UI precisa dele: o HeroUI conta com `box-sizing: border-box`, margens zeradas e botões sem o
 * desenho do navegador. Mas aplicado na página inteira ele reescreveria as telas atuais e as janelas do
 * notch e da barra. Então o arquivo do Tailwind é copiado dentro de `@scope (.hibi-ui)`, na camada `base`,
 * e a raiz dele (`html, :host`) vira a própria `.hibi-ui` (`:scope`).
 *
 * A cópia é gerada, não escrita à mão: `node scripts/scoped-preflight.mjs` a refaz a partir do Tailwind
 * instalado, e `scoped-preflight.test.mjs` falha se ela ficar diferente depois de atualizar o Tailwind.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const OUTPUT = resolve(root, 'src/styles/hibi-ui-preflight.css');

export function scopedPreflight(preflight, version) {
  if (!/^html,\n:host \{/m.test(preflight)) throw new Error('O preflight do Tailwind mudou de forma: a raiz `html, :host` não foi encontrada.');
  const body = preflight.replace(/^html,\n:host \{/m, ':scope {').trimEnd();
  const indented = body.split('\n').map((line) => (line ? `    ${line}` : line)).join('\n');
  return `/* Gerado por scripts/scoped-preflight.mjs a partir de tailwindcss ${version} (preflight.css, licença MIT). Não edite à mão. */\n@layer base {\n  @scope (.hibi-ui) {\n${indented}\n  }\n}\n`;
}

export function readInstalledPreflight() {
  const require = createRequire(import.meta.url);
  const packagePath = require.resolve('tailwindcss/package.json', { paths: [root] });
  const version = JSON.parse(readFileSync(packagePath, 'utf8')).version;
  return { preflight: readFileSync(resolve(dirname(packagePath), 'preflight.css'), 'utf8'), version };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { preflight, version } = readInstalledPreflight();
  writeFileSync(OUTPUT, scopedPreflight(preflight, version));
  console.log(`src/styles/hibi-ui-preflight.css gerado a partir do tailwindcss ${version}`);
}

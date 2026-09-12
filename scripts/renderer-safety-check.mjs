import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const sourceExtensions = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.vue', '.svelte']);
// Gramática TypeScript sem JSX, `.d.ts` incluído. O stripper do Node não lê JSX, então `.tsx` segue
// varrido como está escrito.
const typeScriptExtensions = new Set(['.ts', '.mts', '.cts']);
export const forbiddenReference = /(?:import\s*(?:[^'"`]*?from\s*)?|export\s+[^'"`]*?from\s*|require\s*\(|(?:fetch|readFile|readFileSync|load|execFile|spawn|fork)\s*\(|new\s+URL\s*\(|(?:src|href|url|path|file|asset)\s*[:=])\s*['"`][^'"`]*(?:\.riv|\.wasm|\.exe)(?:[?#][^'"`]*)?['"`]|(?:^|[/'"`])(?:native|helpers?|bin|binaries)(?:[/'"`]|$)|(?:\.app|\.dylib|\.node)(?:[/'"`?#]|$)/i;

function withoutComments(line) {
  return line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
}

// O renderer só carrega o que sobra depois de apagar os tipos. Uma assinatura como
// `host?: 'native' | 'electron'` em `global.d.ts` some na compilação e não referencia nada; varrê-la
// como código foi o falso positivo. Quem apaga é o próprio stripper de TypeScript do Node, que troca
// cada construção só-de-tipo por espaços e preserva as linhas, então a linha reportada é a do fonte.
// Não há exceção por arquivo: se o stripper recusa o arquivo (JSX, parameter property, enum) ou muda a
// contagem de linhas, o fonte é varrido inteiro como está, e o erro é para o lado de reprovar.
export function runtimeText(file, source) {
  if (!typeScriptExtensions.has(path.extname(file))) return source;
  let stripped;
  try {
    stripped = stripTypeScriptTypes(source, { mode: 'strip' });
  } catch {
    return source;
  }
  return stripped.split('\n').length === source.split('\n').length ? stripped : source;
}

export function findViolations(file, source) {
  const lines = source.split('\n');
  return runtimeText(file, source).split('\n').flatMap((line, index) => (
    forbiddenReference.test(withoutComments(line)) ? [{ file, line: index + 1, text: lines[index].trim() }] : []
  ));
}

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(entryPath);
    return sourceExtensions.has(path.extname(entry.name)) ? [entryPath] : [];
  });
}

function main() {
  const root = process.cwd();
  const sourceRoots = ['src', 'renderer']
    .map((directory) => path.join(root, directory))
    .filter((directory) => fs.existsSync(directory) && fs.statSync(directory).isDirectory());

  const violations = sourceRoots.flatMap(filesUnder)
    .flatMap((file) => findViolations(path.relative(root, file), fs.readFileSync(file, 'utf8')));

  if (violations.length > 0) {
    console.error('Renderer safety check failed: forbidden runtime or native-helper reference(s) found.');
    for (const violation of violations) {
      console.error(`- ${violation.file}:${violation.line}: ${violation.text}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`Renderer safety check passed (${sourceRoots.length ? sourceRoots.join(', ') : 'no renderer source roots'} scanned).`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();

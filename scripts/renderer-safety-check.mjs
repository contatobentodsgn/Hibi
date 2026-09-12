import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { parseSync } from 'vite';

const sourceExtensions = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.vue', '.svelte']);
// Gramática TypeScript sem JSX, `.d.ts` incluído. `.tsx` segue varrido como está escrito: nenhum falso
// positivo apareceu nele, e apagar tipos ali só afrouxaria a varredura sem necessidade.
const typeScriptExtensions = new Set(['.ts', '.mts', '.cts']);
export const forbiddenReference = /(?:import\s*(?:[^'"`]*?from\s*)?|export\s+[^'"`]*?from\s*|require\s*\(|(?:fetch|readFile|readFileSync|load|execFile|spawn|fork)\s*\(|new\s+URL\s*\(|(?:src|href|url|path|file|asset)\s*[:=])\s*['"`][^'"`]*(?:\.riv|\.wasm|\.exe)(?:[?#][^'"`]*)?['"`]|(?:^|[/'"`])(?:native|helpers?|bin|binaries)(?:[/'"`]|$)|(?:\.app|\.dylib|\.node)(?:[/'"`?#]|$)/i;

function withoutComments(line) {
  return line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
}

// Construções que existem só para o verificador de tipos e somem inteiras na compilação: anotações
// (`: T`, tipo de retorno, predicado), parâmetros e argumentos de tipo, `type`, `interface`,
// `implements`, imports e exports marcados `type` e declarações ambientes (`declare global`,
// `declare module`, `declare const`).
const typeOnlyNodes = new Set([
  'TSTypeAnnotation',
  'TSTypeAliasDeclaration',
  'TSInterfaceDeclaration',
  'TSTypeParameterDeclaration',
  'TSTypeParameterInstantiation',
  'TSClassImplements',
  'TSNamespaceExportDeclaration',
]);
// Em `x as T`, `x satisfies T` e `<T>x` só o tipo some; a expressão é código e continua na varredura.
const typeCasts = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSTypeAssertion']);

function typeOnlyRanges(node, ranges = []) {
  if (Array.isArray(node)) {
    for (const child of node) typeOnlyRanges(child, ranges);
  } else if (node && typeof node.type === 'string') {
    if (typeOnlyNodes.has(node.type) || node.declare === true || node.importKind === 'type' || node.exportKind === 'type') {
      ranges.push([node.start, node.end]);
      return ranges;
    }
    if (typeCasts.has(node.type)) ranges.push([node.typeAnnotation.start, node.typeAnnotation.end]);
    for (const child of Object.values(node)) {
      if (child && typeof child === 'object') typeOnlyRanges(child, ranges);
    }
  }
  return ranges;
}

// O renderer só carrega o que sobra depois de apagar os tipos. Uma assinatura como
// `host?: 'native' | 'electron'` em `global.d.ts` some na compilação e não referencia nada; varrê-la
// como código foi o falso positivo. Quem diz o que é só-de-tipo é o parser do oxc, que o Vite já usa
// para compilar o renderer, pela `parseSync` que o `vite` exporta. O pacote `typescript` 7 é o
// compilador nativo e só expõe AST em `typescript/unstable/*`; o `stripTypeScriptTypes` do Node ainda
// é experimental. Cada construção só-de-tipo vira espaços com as quebras de linha preservadas, então a
// linha reportada é a do fonte. Não há exceção por arquivo: se o parser recusa o arquivo, ele é varrido
// inteiro como está escrito, e o erro é para o lado de reprovar.
export function runtimeText(file, source) {
  if (!typeScriptExtensions.has(path.extname(file))) return source;
  let parsed;
  try {
    parsed = parseSync(file, source, { lang: 'ts' });
  } catch {
    return source;
  }
  if (parsed.errors.length > 0) return source;
  let text = source;
  for (const [start, end] of typeOnlyRanges(parsed.program)) {
    text = text.slice(0, start) + text.slice(start, end).replace(/[^\r\n]/g, ' ') + text.slice(end);
  }
  return text;
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

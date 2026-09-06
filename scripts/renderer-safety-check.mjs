import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const sourceRoots = ['src', 'renderer']
  .map((directory) => path.join(root, directory))
  .filter((directory) => fs.existsSync(directory) && fs.statSync(directory).isDirectory());

const sourceExtensions = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.vue', '.svelte']);
const forbiddenReference = /(?:import\s*(?:[^'"`]*?from\s*)?|export\s+[^'"`]*?from\s*|require\s*\(|(?:fetch|readFile|readFileSync|load|execFile|spawn|fork)\s*\(|new\s+URL\s*\(|(?:src|href|url|path|file|asset)\s*[:=])\s*['"`][^'"`]*(?:\.riv|\.wasm|\.exe)(?:[?#][^'"`]*)?['"`]|(?:^|[/'"`])(?:native|helpers?|bin|binaries)(?:[/'"`]|$)|(?:\.app|\.dylib|\.node)(?:[/'"`?#]|$)/i;

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(entryPath);
    return sourceExtensions.has(path.extname(entry.name)) ? [entryPath] : [];
  });
}

function withoutComments(line) {
  return line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
}

const violations = sourceRoots.flatMap(filesUnder).flatMap((file) => {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  return lines.flatMap((line, index) => {
    const code = withoutComments(line);
    return forbiddenReference.test(code)
      ? [{ file: path.relative(root, file), line: index + 1, text: line.trim() }]
      : [];
  });
});

if (violations.length > 0) {
  console.error('Renderer safety check failed: forbidden runtime or native-helper reference(s) found.');
  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line}: ${violation.text}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Renderer safety check passed (${sourceRoots.length ? sourceRoots.join(', ') : 'no renderer source roots'} scanned).`);
}

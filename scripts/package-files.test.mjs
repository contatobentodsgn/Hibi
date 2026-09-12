import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// O que entra no `app.asar` é decidido pelo `build.files` do package.json. Este teste não lê o texto
// desses padrões: monta o filtro com o mesmo código que o electron-builder instalado usa ao copiar o
// app (`getMainFileMatchers` + `createFilter`, do app-builder-lib que o próprio CLI carrega, já com as
// exclusões padrão dele) e pergunta a esse filtro, arquivo por arquivo, o que seria empacotado. A
// cópia desce diretório a diretório e só entra num diretório aceito, então cada ancestral também passa
// pelo filtro.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const builderRequire = createRequire(createRequire(import.meta.url).resolve('electron-builder'))
const { getMainFileMatchers } = builderRequire('app-builder-lib/out/fileMatcher')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

function packagedFilter() {
  const config = pkg.build
  const packager = {
    info: {
      projectDir: root,
      buildResourcesDir: path.join(root, config.directories?.buildResources ?? 'build'),
      isPrepackedAppAsar: false,
      config,
      debugLogger: { isEnabled: false },
    },
  }
  const outDir = path.join(root, config.directories?.output ?? 'dist')
  const [matcher] = getMainFileMatchers(root, path.join(outDir, 'app'), (pattern) => pattern, config.mac ?? {}, packager, outDir, false)
  return matcher.createFilter()
}

const filter = packagedFilter()
const directory = { isDirectory: () => true }
const regularFile = { isDirectory: () => false }
function packaged(file) {
  const parts = file.split('/')
  for (let depth = 1; depth < parts.length; depth += 1) {
    if (!filter(path.join(root, ...parts.slice(0, depth)), directory)) return false
  }
  return filter(path.join(root, file), regularFile)
}

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)

// O grafo de runtime a partir do `main`: `require`/`import` relativos e os arquivos que o processo
// principal entrega ao Electron por `path.join(__dirname, ...)` (preloads, HTML). O addon compilado e
// o `dist` não estão no git; entram pelo caminho, que é o que o filtro julga.
const relativeModule = /(?:(?:require|import)\s*\(\s*|from\s+)['"](\.{1,2}\/[^'"]+)['"]/g
const besideModule = /path\.join\(\s*__dirname\s*,\s*['"]([^'"]+)['"]\s*\)/g
function runtimeFiles() {
  const found = new Set()
  const pending = [pkg.main]
  while (pending.length > 0) {
    const file = pending.pop()
    if (found.has(file)) continue
    found.add(file)
    if (!/\.[cm]?js$/.test(file) || !fs.existsSync(path.join(root, file))) continue
    const source = fs.readFileSync(path.join(root, file), 'utf8')
    for (const [, reference] of [...source.matchAll(relativeModule), ...source.matchAll(besideModule)]) {
      pending.push(path.posix.normalize(path.posix.join(path.posix.dirname(file), reference)))
    }
  }
  return [...found].sort()
}

test('no test file is packaged into app.asar', () => {
  const tests = tracked.filter((file) => /\.test\.[cm]?[jt]sx?$/.test(file))
  assert.ok(tests.includes('electron/main.test.cjs') && tests.includes('native/notch/host.test.cjs'), 'a lista de testes não pode esvaziar sem ninguém ver')
  assert.deepEqual(tests.filter(packaged), [])
})

test('type declarations, which nothing loads at runtime, are not packaged', () => {
  const declarations = tracked.filter((file) => /\.d\.[cm]?ts$/.test(file))
  assert.ok(declarations.includes('electron/notifications.d.mts'), 'a lista de declarações não pode esvaziar sem ninguém ver')
  assert.deepEqual(declarations.filter(packaged), [])
})

test('every file the main process reaches from package.json main is packaged', () => {
  const runtime = runtimeFiles()
  for (const expected of [
    'electron/main.cjs',
    'electron/preload.cjs',
    'electron/notch-preload.cjs',
    'electron/notifications.mjs',
    'electron/focus-gate.mjs',
    'native/notch/index.cjs',
    'native/notch/keychain.cjs',
    'native/notch/build/Release/hibi_notch.node',
    'dist/index.html',
  ]) {
    assert.ok(runtime.includes(expected), `${expected} saiu do grafo de runtime: o teste deixou de enxergá-lo`)
  }
  assert.deepEqual(runtime.filter((file) => !packaged(file)), [])
})

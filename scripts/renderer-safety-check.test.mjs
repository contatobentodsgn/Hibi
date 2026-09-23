import test from 'node:test'
import assert from 'node:assert/strict'
import { findViolations } from './renderer-safety-check.mjs'

// O falso positivo original: assinaturas da ponte do desktop em `global.d.ts` nomeiam o host
// `'native'` num union de tipo, que some na compilação.
test('a type declaration that names the native host is not a runtime reference', () => {
  const source = [
    "import type { NotchContract } from '../native/notch/contracts';",
    'declare global {',
    '  interface Window {',
    "    pixanoDesktop?: { showNotch?: () => Promise<{ host?: 'native' | 'electron' }> };",
    '  }',
    '}',
    'export {};',
  ].join('\n')

  assert.deepEqual(findViolations('src/global.d.ts', source), [])
})

test('a runtime reference survives type erasure and is reported on its source line', () => {
  const source = [
    "type Host = 'native' | 'electron';",
    'interface Addon { host: Host }',
    "const addon: Addon = require('../native/notch/build/Release/notch.node');",
    'export const host = (): Host => addon.host;',
  ].join('\n')

  assert.deepEqual(findViolations('src/ui/notch-host.ts', source).map(({ line }) => line), [3])
})

test('a declaration file is not a hiding place for a runtime reference', () => {
  const source = "export const addon = require('../native/notch/build/Release/notch.node');"

  assert.equal(findViolations('src/global.d.ts', source).length, 1)
})

test('JSX files, which the stripper cannot read, are scanned as written', () => {
  const source = [
    "import helper from './helpers/notch.node';",
    'export const View = () => <div>{String(helper)}</div>;',
  ].join('\n')

  assert.deepEqual(findViolations('src/ui/NotchView.tsx', source).map(({ line }) => line), [1])
})

// Cada forma de tipo que consegue nomear o host some; a única linha de runtime continua reprovada.
// A linha com acento e emoji vem antes do código: se as posições do parser não fossem as do texto
// (bytes em vez de unidades UTF-16), o apagamento cairia fora do lugar e o resultado mudaria.
test('every type-only construct is erased, and the runtime line after it is still reported', () => {
  const source = [
    "const rótulo = 'ação 🚀';",
    "import type { Bridge } from '../native/notch/contracts';",
    "declare global { interface Window { host?: 'native' | 'electron' } }",
    "declare module '../native/notch/contracts' { export type Bridge = unknown }",
    "export function pick<T extends 'native' | 'electron'>(host: T): host is T { return true }",
    "export const chosen = pick<'native'>('electron' as 'native' satisfies 'native');",
    "export class Host implements Pick<Window, 'native'> { kind!: 'native' }",
    "const addon: Bridge = require('../native/notch/build/Release/notch.node');",
  ].join('\n')

  assert.deepEqual(findViolations('src/ui/notch-host.ts', source).map(({ line }) => line), [8])
})

test('a file the parser rejects is scanned as written, type lines included', () => {
  const source = [
    "type Host = 'native' | 'electron';",
    'export const broken = (',
  ].join('\n')

  assert.deepEqual(findViolations('src/ui/broken.ts', source).map(({ line }) => line), [1])
})

test('TypeScript the stripper refuses is scanned as written instead of skipped', () => {
  const source = [
    'export class Host {',
    "  constructor(private readonly addon = require('../native/notch/build/Release/notch.node')) {}",
    '}',
  ].join('\n')

  assert.deepEqual(findViolations('src/ui/host.ts', source).map(({ line }) => line), [2])
})

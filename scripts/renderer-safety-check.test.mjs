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
    "    hibiDesktop?: { showNotch?: () => Promise<{ host?: 'native' | 'electron' }> };",
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

test('TypeScript the stripper refuses is scanned as written instead of skipped', () => {
  const source = [
    'export class Host {',
    "  constructor(private readonly addon = require('../native/notch/build/Release/notch.node')) {}",
    '}',
  ].join('\n')

  assert.deepEqual(findViolations('src/ui/host.ts', source).map(({ line }) => line), [2])
})

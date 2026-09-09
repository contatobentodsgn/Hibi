import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../tokens.css', import.meta.url), 'utf8')

const block = (selector: string): Record<string, string> => {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`Bloco não encontrado: ${selector}`)
  const body = css.slice(start, css.indexOf('}', start))
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((match) => [match[1]!, match[2]!.trim()]))
}

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255).map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}
export const contrastRatio = (foreground: string, background: string) => {
  const [high, low] = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (high! + 0.05) / (low! + 0.05)
}

const light = block(':root')
const dark = block(':root[data-theme="dark"]')
const semantic = Object.keys(light).filter((name) => /^--(bg|text|stroke|accent|cat|depth)-/.test(name))
const textTokens = ['--text-primary', '--text-secondary', '--text-tertiary']
const surfaceTokens = ['--bg-canvas', '--bg-surface-1', '--bg-surface-2', '--bg-surface-3']

describe('tokens.css', () => {
  it('define todo token semântico nos dois temas', () => {
    expect(semantic.length).toBeGreaterThan(20)
    for (const name of semantic) expect(dark, `${name} falta no escuro`).toHaveProperty(name)
  })

  it('usa hex de 6 dígitos nas cores de texto e fundo', () => {
    for (const theme of [light, dark]) for (const name of [...textTokens, ...surfaceTokens, '--accent', '--text-on-accent']) expect(theme[name]).toMatch(/^#[0-9a-f]{6}$/)
  })

  it.each([['claro', light], ['escuro', dark]])('atinge WCAG AA (4.5:1) para texto sobre superfícies no tema %s', (_label, theme) => {
    for (const text of textTokens) for (const surface of surfaceTokens) {
      expect(contrastRatio(theme[text]!, theme[surface]!), `${text} sobre ${surface}`).toBeGreaterThanOrEqual(4.5)
    }
    expect(contrastRatio(theme['--text-on-accent']!, theme['--accent']!), 'texto sobre acento').toBeGreaterThanOrEqual(4.5)
  })

  it('mantém as 8 variáveis antigas como aliases dos tokens', () => {
    const aliases = block(':root /* aliases */')
    expect(aliases['--paper']).toBe('var(--bg-canvas)')
    expect(aliases['--ink']).toBe('var(--text-primary)')
    expect(aliases['--muted']).toBe('var(--text-secondary)')
    expect(aliases['--line']).toBe('var(--stroke-default)')
    expect(aliases['--orange']).toBe('var(--accent)')
    expect(aliases['--green']).toBe('var(--cat-break-soft)')
    expect(aliases['--blue']).toBe('var(--cat-learning-soft)')
    expect(aliases['--amber']).toBe('var(--cat-important-soft)')
  })
})

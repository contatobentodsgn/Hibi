import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { applyContrastPreference, applyMotionPreference, applyThemePreference, applyTintPreference, CONTRAST_STORAGE_KEY, MOTION_STORAGE_KEY, readContrastPreference, readMotionPreference, readThemePreference, readTintPreference, resolveTheme, THEME_STORAGE_KEY, TINT_STORAGE_KEY, type ThemeHost } from '../theme'
import { ThemeProvider, useThemePreference } from '../theme-context'

const host = (systemPrefersDark: boolean, stored: string | null = null): ThemeHost & { attributes: Record<string, string>; listeners: Array<(event: { matches: boolean }) => void>; store: Map<string, string> } => {
  const store = new Map<string, string>(stored === null ? [] : [[THEME_STORAGE_KEY, stored]])
  const attributes: Record<string, string> = {}
  const listeners: Array<(event: { matches: boolean }) => void> = []
  return {
    store, attributes, listeners,
    storage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => { store.set(key, value) } },
    root: { setAttribute: (name, value) => { attributes[name] = value } },
    media: { matches: systemPrefersDark, addEventListener: (_type, listener) => { listeners.push(listener) }, removeEventListener: (_type, listener) => { listeners.splice(listeners.indexOf(listener), 1) } },
  }
}

describe('tema', () => {
  it('resolve system pelo sistema e manual por si', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
  })

  it('lê a preferência guardada e cai em system para valores inválidos', () => {
    expect(readThemePreference(host(false, 'dark').storage)).toBe('dark')
    expect(readThemePreference(host(false, 'azul').storage)).toBe('system')
    expect(readThemePreference(host(false).storage)).toBe('system')
  })

  it('lê o tom guardado e cai em Lavanda, o padrão do preview, para valores inválidos', () => {
    const fake = host(false)
    fake.store.set(TINT_STORAGE_KEY, 'blue')
    expect(readTintPreference(fake.storage)).toBe('blue')
    fake.store.set(TINT_STORAGE_KEY, 'sunset')
    expect(readTintPreference(fake.storage)).toBe('lavender')
    expect(readTintPreference(host(false).storage)).toBe('lavender')
  })

  // Os cinco tons de antes viram o mais próximo dos quatro do preview: ninguém perde a escolha feita.
  it('converte o tom escolhido antes para o mais próximo do preview', () => {
    const fake = host(false)
    for (const [before, after] of [['aurora', 'lavender'], ['iris', 'lavender'], ['ocean', 'blue'], ['moss', 'mint'], ['rose', 'peach']] as const) {
      fake.store.set(TINT_STORAGE_KEY, before)
      expect(readTintPreference(fake.storage), before).toBe(after)
    }
  })

  it('"Mais contraste" e "Reduzir movimento" são lidos, aplicados na raiz e guardados', () => {
    const fake = host(false)
    expect(readContrastPreference(fake.storage)).toBe('normal')
    expect(readMotionPreference(fake.storage)).toBe('system')
    applyContrastPreference('more', fake)
    applyMotionPreference('reduce', fake)
    expect(fake.attributes['data-contrast']).toBe('more')
    expect(fake.attributes['data-motion']).toBe('reduce')
    expect(readContrastPreference(fake.storage)).toBe('more')
    expect(readMotionPreference(fake.storage)).toBe('reduce')
    fake.store.set(CONTRAST_STORAGE_KEY, 'máximo')
    fake.store.set(MOTION_STORAGE_KEY, 'zero')
    expect(readContrastPreference(fake.storage)).toBe('normal')
    expect(readMotionPreference(fake.storage)).toBe('system')
  })

  it('aplica o atributo, persiste e segue o sistema enquanto for system', () => {
    const fake = host(false)
    const stop = applyThemePreference('system', fake)
    expect(fake.attributes['data-theme']).toBe('light')
    expect(fake.store.get(THEME_STORAGE_KEY)).toBe('system')
    fake.listeners[0]!({ matches: true })
    expect(fake.attributes['data-theme']).toBe('dark')
    stop()
    expect(fake.listeners).toHaveLength(0)
  })

  it('não escuta o sistema quando a escolha é manual', () => {
    const fake = host(true)
    applyThemePreference('light', fake)
    expect(fake.attributes['data-theme']).toBe('light')
    expect(fake.listeners).toHaveLength(0)
  })

  it('cai em system quando a leitura do armazenamento lança', () => {
    const storage: Pick<Storage, 'getItem'> = { getItem: () => { throw new Error('indisponível') } }
    expect(readThemePreference(storage)).toBe('system')
  })

  it('mantém o atributo data-theme mesmo quando a escrita falha', () => {
    const fake = host(false)
    fake.storage.setItem = () => { throw new Error('quota excedida') }
    expect(() => applyThemePreference('dark', fake)).not.toThrow()
    expect(fake.attributes['data-theme']).toBe('dark')
  })

  it('aplica Lavanda como tom padrão sem alterar a escolha de tema', () => {
    const fake = host(false)
    applyThemePreference('dark', fake)
    expect(fake.attributes['data-theme']).toBe('dark')
    expect(fake.attributes['data-tint']).toBe('lavender')
  })

  it('persiste o tint escolhido sem alterar data-theme', () => {
    const fake = host(true)
    applyThemePreference('system', fake)
    applyTintPreference('mint', fake)
    expect(fake.attributes['data-theme']).toBe('dark')
    expect(fake.attributes['data-tint']).toBe('mint')
    expect(fake.store.get(TINT_STORAGE_KEY)).toBe('mint')
  })
})

describe('ThemeProvider', () => {
  const Consumer = () => {
    const { preference } = useThemePreference()
    return React.createElement('span', null, preference)
  }

  it('renderiza os filhos e aplica a preferência guardada por um host fake', () => {
    const fake = host(false, 'dark')
    const markup = renderToStaticMarkup(React.createElement(ThemeProvider, { host: fake, children: React.createElement(Consumer) }))
    expect(markup).toContain('dark')
  })

  it('não lança ao montar mesmo se a leitura do host fake falhar', () => {
    const fake = host(false)
    fake.storage.getItem = () => { throw new Error('indisponível') }
    expect(() => renderToStaticMarkup(React.createElement(ThemeProvider, { host: fake, children: React.createElement('p', null, 'olá') }))).not.toThrow()
  })
})

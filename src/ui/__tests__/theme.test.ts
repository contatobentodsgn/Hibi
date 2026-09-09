import { describe, expect, it } from 'vitest'
import { applyThemePreference, readThemePreference, resolveTheme, THEME_STORAGE_KEY, type ThemeHost } from '../theme'

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
})

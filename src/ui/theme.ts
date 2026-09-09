export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'hibi-theme'
export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark']

export type ThemeHost = Readonly<{
  storage: Pick<Storage, 'getItem' | 'setItem'>
  root: { setAttribute(name: string, value: string): void }
  media: { matches: boolean; addEventListener(type: 'change', listener: (event: { matches: boolean }) => void): void; removeEventListener(type: 'change', listener: (event: { matches: boolean }) => void): void }
}>

export const isThemePreference = (value: unknown): value is ThemePreference => value === 'system' || value === 'light' || value === 'dark'

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light'
  return preference
}

export function readThemePreference(storage: Pick<Storage, 'getItem'>): ThemePreference {
  try { const saved = storage.getItem(THEME_STORAGE_KEY); return isThemePreference(saved) ? saved : 'system' } catch { return 'system' }
}

// Aplica o tema agora e, em `system`, segue o sistema até a função devolvida ser chamada.
export function applyThemePreference(preference: ThemePreference, host: ThemeHost): () => void {
  try { host.storage.setItem(THEME_STORAGE_KEY, preference) } catch { /* armazenamento indisponível */ }
  host.root.setAttribute('data-theme', resolveTheme(preference, host.media.matches))
  if (preference !== 'system') return () => undefined
  const listener = (event: { matches: boolean }) => host.root.setAttribute('data-theme', resolveTheme('system', event.matches))
  host.media.addEventListener('change', listener)
  return () => host.media.removeEventListener('change', listener)
}

export const browserThemeHost = (): ThemeHost => ({
  storage: window.localStorage,
  root: document.documentElement,
  media: window.matchMedia('(prefers-color-scheme: dark)'),
})

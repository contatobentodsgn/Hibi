export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'
// Dez acentos para personalização; Lavanda mantém o padrão do preview aprovado.
export type TintPreference = 'lavender' | 'blue' | 'teal' | 'mint' | 'forest' | 'amber' | 'coral' | 'rose' | 'plum' | 'graphite'
export type ContrastPreference = 'normal' | 'more'
export type MotionPreference = 'system' | 'reduce'

export const THEME_STORAGE_KEY = 'hibi-theme'
export const TINT_STORAGE_KEY = 'hibi-tint'
export const CONTRAST_STORAGE_KEY = 'hibi-contrast'
export const MOTION_STORAGE_KEY = 'hibi-motion'

// Preferências antigas continuam válidas ou migram para o acento moderno mais próximo.
const PREVIOUS_TINTS: Readonly<Record<string, TintPreference>> = { aurora: 'lavender', iris: 'plum', ocean: 'blue', moss: 'forest', peach: 'coral' }

export type ThemeHost = Readonly<{
  storage: Pick<Storage, 'getItem' | 'setItem'>
  root: { setAttribute(name: string, value: string): void }
  media: { matches: boolean; addEventListener(type: 'change', listener: (event: { matches: boolean }) => void): void; removeEventListener(type: 'change', listener: (event: { matches: boolean }) => void): void }
}>

export const isThemePreference = (value: unknown): value is ThemePreference => value === 'system' || value === 'light' || value === 'dark'
export const isTintPreference = (value: unknown): value is TintPreference => value === 'lavender' || value === 'blue' || value === 'teal' || value === 'mint' || value === 'forest' || value === 'amber' || value === 'coral' || value === 'rose' || value === 'plum' || value === 'graphite'
export const isContrastPreference = (value: unknown): value is ContrastPreference => value === 'normal' || value === 'more'
export const isMotionPreference = (value: unknown): value is MotionPreference => value === 'system' || value === 'reduce'

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light'
  return preference
}

export function readThemePreference(storage: Pick<Storage, 'getItem'>): ThemePreference {
  try { const saved = storage.getItem(THEME_STORAGE_KEY); return isThemePreference(saved) ? saved : 'system' } catch { return 'system' }
}

export function readTintPreference(storage: Pick<Storage, 'getItem'>): TintPreference {
  try {
    const saved = storage.getItem(TINT_STORAGE_KEY)
    if (isTintPreference(saved)) return saved
    return (saved !== null && PREVIOUS_TINTS[saved]) || 'lavender'
  } catch { return 'lavender' }
}

export function readContrastPreference(storage: Pick<Storage, 'getItem'>): ContrastPreference {
  try { const saved = storage.getItem(CONTRAST_STORAGE_KEY); return isContrastPreference(saved) ? saved : 'normal' } catch { return 'normal' }
}

export function readMotionPreference(storage: Pick<Storage, 'getItem'>): MotionPreference {
  try { const saved = storage.getItem(MOTION_STORAGE_KEY); return isMotionPreference(saved) ? saved : 'system' } catch { return 'system' }
}

// Aplica o tema agora e, em `system`, segue o sistema até a função devolvida ser chamada.
export function applyThemePreference(preference: ThemePreference, host: ThemeHost, tint = readTintPreference(host.storage)): () => void {
  try { host.storage.setItem(THEME_STORAGE_KEY, preference) } catch { /* armazenamento indisponível */ }
  host.root.setAttribute('data-theme', resolveTheme(preference, host.media.matches))
  host.root.setAttribute('data-tint', tint)
  if (preference !== 'system') return () => undefined
  const listener = (event: { matches: boolean }) => host.root.setAttribute('data-theme', resolveTheme('system', event.matches))
  host.media.addEventListener('change', listener)
  return () => host.media.removeEventListener('change', listener)
}

export function applyTintPreference(tint: TintPreference, host: ThemeHost): void {
  try { host.storage.setItem(TINT_STORAGE_KEY, tint) } catch { /* armazenamento indisponível */ }
  host.root.setAttribute('data-tint', tint)
}

// "Mais contraste" e "Reduzir movimento", do preview aprovado: atributos na raiz, lidos pelos tokens.
export function applyContrastPreference(contrast: ContrastPreference, host: ThemeHost): void {
  try { host.storage.setItem(CONTRAST_STORAGE_KEY, contrast) } catch { /* armazenamento indisponível */ }
  host.root.setAttribute('data-contrast', contrast)
}

export function applyMotionPreference(motion: MotionPreference, host: ThemeHost): void {
  try { host.storage.setItem(MOTION_STORAGE_KEY, motion) } catch { /* armazenamento indisponível */ }
  host.root.setAttribute('data-motion', motion)
}

const noopStorage: Pick<Storage, 'getItem' | 'setItem'> = { getItem: () => null, setItem: () => undefined }
const noopMedia: ThemeHost['media'] = { matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }

// window.localStorage e window.matchMedia podem lançar (política de armazenamento restritiva,
// contexto embutido sem suporte); caem para no-ops para o app sempre conseguir montar.
const safeStorage = (): Pick<Storage, 'getItem' | 'setItem'> => {
  try { return window.localStorage } catch { return noopStorage }
}

const safeMedia = (): ThemeHost['media'] => {
  try { return typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : noopMedia } catch { return noopMedia }
}

export const browserThemeHost = (): ThemeHost => ({
  storage: safeStorage(),
  root: document.documentElement,
  media: safeMedia(),
})

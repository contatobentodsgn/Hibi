import React, { createContext, useContext, useLayoutEffect, useState } from 'react'
import { applyContrastPreference, applyMotionPreference, applyThemePreference, applyTintPreference, browserThemeHost, readContrastPreference, readMotionPreference, readThemePreference, readTintPreference, type ContrastPreference, type MotionPreference, type ThemeHost, type ThemePreference, type TintPreference } from './theme'

type ThemeContextValue = Readonly<{ preference: ThemePreference; setPreference: (preference: ThemePreference) => void; tint: TintPreference; setTint: (tint: TintPreference) => void; contrast: ContrastPreference; setContrast: (contrast: ContrastPreference) => void; motion: MotionPreference; setMotion: (motion: MotionPreference) => void }>
const ThemeContext = createContext<ThemeContextValue>({ preference: 'system', setPreference: () => undefined, tint: 'lavender', setTint: () => undefined, contrast: 'normal', setContrast: () => undefined, motion: 'system', setMotion: () => undefined })

// `host` é opcional para testes injetarem um fake; em produção cai para browserThemeHost(),
// construído de forma preguiçosa (dentro do useState) para que importar este módulo nunca toque em `window`.
export function ThemeProvider({ children, host }: { children: React.ReactNode; host?: ThemeHost }) {
  const [themeHost] = useState<ThemeHost>(() => host ?? browserThemeHost())
  const [preference, setPreference] = useState<ThemePreference>(() => readThemePreference(themeHost.storage))
  const [tint, setTint] = useState<TintPreference>(() => readTintPreference(themeHost.storage))
  const [contrast, setContrast] = useState<ContrastPreference>(() => readContrastPreference(themeHost.storage))
  const [motion, setMotion] = useState<MotionPreference>(() => readMotionPreference(themeHost.storage))
  // Antes do primeiro desenho: com `useEffect`, o tema entrava depois de a tela aparecer, e quem usa o escuro
  // via um quadro claro ao abrir o app.
  useLayoutEffect(() => applyThemePreference(preference, themeHost, tint), [preference, themeHost, tint])
  useLayoutEffect(() => applyTintPreference(tint, themeHost), [tint, themeHost])
  useLayoutEffect(() => applyContrastPreference(contrast, themeHost), [contrast, themeHost])
  useLayoutEffect(() => applyMotionPreference(motion, themeHost), [motion, themeHost])
  return <ThemeContext.Provider value={{ preference, setPreference, tint, setTint, contrast, setContrast, motion, setMotion }}>{children}</ThemeContext.Provider>
}

export const useThemePreference = () => useContext(ThemeContext)

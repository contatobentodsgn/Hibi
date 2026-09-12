import React, { createContext, useContext, useEffect, useState } from 'react'
import { applyThemePreference, applyTintPreference, browserThemeHost, readThemePreference, readTintPreference, type ThemeHost, type ThemePreference, type TintPreference } from './theme'

type ThemeContextValue = Readonly<{ preference: ThemePreference; setPreference: (preference: ThemePreference) => void; tint: TintPreference; setTint: (tint: TintPreference) => void }>
const ThemeContext = createContext<ThemeContextValue>({ preference: 'system', setPreference: () => undefined, tint: 'aurora', setTint: () => undefined })

// `host` é opcional para testes injetarem um fake; em produção cai para browserThemeHost(),
// construído de forma preguiçosa (dentro do useState) para que importar este módulo nunca toque em `window`.
export function ThemeProvider({ children, host }: { children: React.ReactNode; host?: ThemeHost }) {
  const [themeHost] = useState<ThemeHost>(() => host ?? browserThemeHost())
  const [preference, setPreference] = useState<ThemePreference>(() => readThemePreference(themeHost.storage))
  const [tint, setTint] = useState<TintPreference>(() => readTintPreference(themeHost.storage))
  useEffect(() => applyThemePreference(preference, themeHost, tint), [preference, themeHost, tint])
  useEffect(() => applyTintPreference(tint, themeHost), [tint, themeHost])
  return <ThemeContext.Provider value={{ preference, setPreference, tint, setTint }}>{children}</ThemeContext.Provider>
}

export const useThemePreference = () => useContext(ThemeContext)

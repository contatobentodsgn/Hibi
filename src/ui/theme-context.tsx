import React, { createContext, useContext, useEffect, useState } from 'react'
import { applyThemePreference, browserThemeHost, readThemePreference, type ThemeHost, type ThemePreference } from './theme'

type ThemeContextValue = Readonly<{ preference: ThemePreference; setPreference: (preference: ThemePreference) => void }>
const ThemeContext = createContext<ThemeContextValue>({ preference: 'system', setPreference: () => undefined })

// `host` é opcional para testes injetarem um fake; em produção cai para browserThemeHost(),
// construído de forma preguiçosa (dentro do useState) para que importar este módulo nunca toque em `window`.
export function ThemeProvider({ children, host }: { children: React.ReactNode; host?: ThemeHost }) {
  const [themeHost] = useState<ThemeHost>(() => host ?? browserThemeHost())
  const [preference, setPreference] = useState<ThemePreference>(() => readThemePreference(themeHost.storage))
  useEffect(() => applyThemePreference(preference, themeHost), [preference, themeHost])
  return <ThemeContext.Provider value={{ preference, setPreference }}>{children}</ThemeContext.Provider>
}

export const useThemePreference = () => useContext(ThemeContext)

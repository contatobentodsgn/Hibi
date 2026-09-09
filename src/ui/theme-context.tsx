import React, { createContext, useContext, useEffect, useState } from 'react'
import { applyThemePreference, browserThemeHost, readThemePreference, type ThemePreference } from './theme'

type ThemeContextValue = Readonly<{ preference: ThemePreference; setPreference: (preference: ThemePreference) => void }>
const ThemeContext = createContext<ThemeContextValue>({ preference: 'system', setPreference: () => undefined })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(() => readThemePreference(window.localStorage))
  useEffect(() => applyThemePreference(preference, browserThemeHost()), [preference])
  return <ThemeContext.Provider value={{ preference, setPreference }}>{children}</ThemeContext.Provider>
}

export const useThemePreference = () => useContext(ThemeContext)

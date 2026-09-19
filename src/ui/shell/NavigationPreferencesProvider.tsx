import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { readNavigationPosition, writeNavigationPosition, type NavigationPosition } from './navigation-preferences'

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>
type NavigationPreferences = Readonly<{ position: NavigationPosition; setPosition: (position: NavigationPosition) => void; saveFailed: boolean }>

const NavigationPreferencesContext = createContext<NavigationPreferences>({ position: 'top', setPosition: () => undefined, saveFailed: false })

// `window.localStorage` pode lançar (política de armazenamento, contexto sem janela): sem ele, a posição
// funciona só na sessão.
const browserStorage = (): PreferenceStorage | null => {
  try { return window.localStorage } catch { return null }
}

/**
 * A posição da barra, compartilhada entre o shell e os Ajustes. Trocar a posição só re-renderiza a barra: a
 * área de conteúdo é o mesmo elemento nas duas posições, então telas, rascunhos e sessões não remontam.
 */
export function NavigationPreferencesProvider({ children, storage }: Readonly<{ children: ReactNode; storage?: PreferenceStorage | null }>) {
  const [store] = useState(() => (storage === undefined ? browserStorage() : storage))
  const [position, setPositionState] = useState(() => readNavigationPosition(store))
  const [saveFailed, setSaveFailed] = useState(false)
  const setPosition = useCallback((next: NavigationPosition) => {
    setPositionState(next)
    setSaveFailed(!writeNavigationPosition(store, next))
  }, [store])
  const value = useMemo(() => ({ position, setPosition, saveFailed }), [position, setPosition, saveFailed])
  return <NavigationPreferencesContext.Provider value={value}>{children}</NavigationPreferencesContext.Provider>
}

export const useNavigationPreferences = () => useContext(NavigationPreferencesContext)

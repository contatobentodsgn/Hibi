import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { readMascotPlacement, readNavigationPreference, resolveNavigationPosition, writeMascotPlacement, writeNavigationPreference, type NavigationPosition, type NavigationPreference } from './navigation-preferences'

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>
type NavigationPreferences = Readonly<{
  /** A escolha da pessoa: em cima, embaixo ou automática. */
  preference: NavigationPreference
  setPreference: (preference: NavigationPreference) => void
  /** A posição que vale agora. */
  position: NavigationPosition
  /** Se o mascote do notch está na mesma tela que a janela (só no app de desktop). */
  mascotSharesDisplay: boolean
  saveFailed: boolean
}>

const NavigationPreferencesContext = createContext<NavigationPreferences>({ preference: 'auto', setPreference: () => undefined, position: 'top', mascotSharesDisplay: false, saveFailed: false })

// `window.localStorage` pode lançar (política de armazenamento, contexto sem janela): sem ele, a escolha
// funciona só na sessão.
const browserStorage = (): PreferenceStorage | null => {
  try { return window.localStorage } catch { return null }
}

const placementBridge = () => (typeof window === 'undefined' ? undefined : window.pixanoDesktop)

/**
 * A posição da barra, compartilhada entre o shell e os Ajustes. Trocar a posição só re-renderiza a barra: a
 * área de conteúdo é o mesmo elemento nas duas posições, então telas, rascunhos e sessões não remontam. Na
 * automática, o processo principal diz se o mascote está na tela da janela e avisa quando isso muda; até a
 * primeira resposta, vale a última guardada.
 */
export function NavigationPreferencesProvider({ children, storage }: Readonly<{ children: ReactNode; storage?: PreferenceStorage | null }>) {
  const [store] = useState(() => (storage === undefined ? browserStorage() : storage))
  const [preference, setPreferenceState] = useState(() => readNavigationPreference(store))
  const [saveFailed, setSaveFailed] = useState(false)
  const [mascotSharesDisplay, setMascotSharesDisplay] = useState(() => (placementBridge()?.getNotchWindowPlacement ? readMascotPlacement(store) : false))

  useEffect(() => {
    const bridge = placementBridge()
    if (!bridge?.getNotchWindowPlacement) return
    let alive = true
    const apply = (sharesDisplay: boolean) => { setMascotSharesDisplay(sharesDisplay); writeMascotPlacement(store, sharesDisplay) }
    bridge.getNotchWindowPlacement().then((state) => { if (alive) apply(state?.sharesDisplay === true) }, () => undefined)
    const stop = bridge.onNotchWindowPlacementChanged?.((state) => apply(state.sharesDisplay === true))
    return () => { alive = false; stop?.() }
  }, [store])

  const setPreference = useCallback((next: NavigationPreference) => {
    setPreferenceState(next)
    setSaveFailed(!writeNavigationPreference(store, next))
  }, [store])
  const position = resolveNavigationPosition(preference, mascotSharesDisplay)
  const value = useMemo(() => ({ preference, setPreference, position, mascotSharesDisplay, saveFailed }), [preference, setPreference, position, mascotSharesDisplay, saveFailed])
  return <NavigationPreferencesContext.Provider value={value}>{children}</NavigationPreferencesContext.Provider>
}

export const useNavigationPreferences = () => useContext(NavigationPreferencesContext)

// A posição da barra de navegação (U04): uma preferência visual local, independente do monitor e da posição
// do mascote do notch. Contrato da seção 6 do plano de 18/09.

export type NavigationPosition = 'top' | 'bottom'

export const NAVIGATION_POSITION_KEY = 'hibi.ui.navigation-position.v1'

/** Qualquer valor que não seja `bottom` (ausente, de outra versão, corrompido) vira o padrão: em cima. */
export function parseNavigationPosition(value: unknown): NavigationPosition {
  return value === 'bottom' ? 'bottom' : 'top'
}

export function readNavigationPosition(storage: Pick<Storage, 'getItem'> | null): NavigationPosition {
  try { return parseNavigationPosition(storage?.getItem(NAVIGATION_POSITION_KEY)) } catch { return 'top' }
}

/** Grava e diz se conseguiu: com o armazenamento recusado, a posição vale só até fechar o Hibi. */
export function writeNavigationPosition(storage: Pick<Storage, 'setItem'> | null, position: NavigationPosition): boolean {
  if (!storage) return false
  try { storage.setItem(NAVIGATION_POSITION_KEY, position); return true } catch { return false }
}

// A posição da barra de navegação: uma preferência visual local, que não mexe no monitor do mascote do notch
// (contrato da seção 6 do plano de 18/09). Desde a U04b, o padrão é "Automática", por decisão do usuário: a
// barra desce só quando o mascote do notch está na mesma tela que a janela do Hibi, para ele não cobrir o meio
// dela; em telas diferentes, ou sem mascote, ela fica em cima. Superior e Inferior fixam a posição.

export type NavigationPosition = 'top' | 'bottom'
export type NavigationPreference = NavigationPosition | 'auto'

export const NAVIGATION_POSITION_KEY = 'hibi.ui.navigation-position.v1'

/** `top` e `bottom` são escolhas; qualquer outro valor (ausente, de outra versão, corrompido) é a automática. */
export function parseNavigationPreference(value: unknown): NavigationPreference {
  return value === 'top' || value === 'bottom' ? value : 'auto'
}

/** A posição que vale agora: a escolhida, ou, na automática, embaixo só com o mascote na tela da janela. */
export function resolveNavigationPosition(preference: NavigationPreference, mascotSharesDisplay: boolean): NavigationPosition {
  if (preference === 'auto') return mascotSharesDisplay ? 'bottom' : 'top'
  return preference
}

export function readNavigationPreference(storage: Pick<Storage, 'getItem'> | null): NavigationPreference {
  try { return parseNavigationPreference(storage?.getItem(NAVIGATION_POSITION_KEY)) } catch { return 'auto' }
}

/** Grava e diz se conseguiu: com o armazenamento recusado, a escolha vale só até fechar o Hibi. */
export function writeNavigationPreference(storage: Pick<Storage, 'setItem'> | null, preference: NavigationPreference): boolean {
  if (!storage) return false
  try { storage.setItem(NAVIGATION_POSITION_KEY, preference); return true } catch { return false }
}

// A última resposta do processo principal sobre o mascote, para o primeiro quadro. A resposta chega por uma
// ponte assíncrona, depois do primeiro desenho: sem guardar a anterior, a automática abria o Hibi com a barra em
// cima e a descia logo em seguida, empurrando o conteúdo.
export const MASCOT_PLACEMENT_KEY = 'hibi.ui.mascot-shares-display.v1'

/** O mascote dividia a tela com a janela na última vez? Sem resposta guardada, ou sem armazenamento, não. */
export function readMascotPlacement(storage: Pick<Storage, 'getItem'> | null): boolean {
  try { return storage?.getItem(MASCOT_PLACEMENT_KEY) === 'true' } catch { return false }
}

export function writeMascotPlacement(storage: Pick<Storage, 'setItem'> | null, sharesDisplay: boolean): void {
  try { storage?.setItem(MASCOT_PLACEMENT_KEY, String(sharesDisplay)) } catch { /* sem armazenamento, só o primeiro quadro perde */ }
}

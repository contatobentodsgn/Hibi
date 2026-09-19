import { describe, expect, it } from 'vitest'
import { NAVIGATION_POSITION_KEY, parseNavigationPreference, readNavigationPreference, resolveNavigationPosition, writeNavigationPreference } from '../shell/navigation-preferences'

const memory = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial))
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, values }
}
const refusing = { getItem: () => { throw new Error('bloqueado') }, setItem: () => { throw new Error('cota') } }

describe('posição da barra de navegação', () => {
  it('guarda em cima e embaixo como escolhas; qualquer outro valor é a automática, o padrão', () => {
    expect(parseNavigationPreference('bottom')).toBe('bottom')
    expect(parseNavigationPreference('top')).toBe('top')
    expect(parseNavigationPreference('auto')).toBe('auto')
    for (const value of [null, undefined, '', 'BOTTOM', 'left', 'inferior', 1, {}, ['bottom']]) expect(parseNavigationPreference(value), String(value)).toBe('auto')
  })

  it('na automática, desce só quando o mascote divide a tela com a janela; as escolhas valem sempre', () => {
    expect(resolveNavigationPosition('auto', true)).toBe('bottom')
    expect(resolveNavigationPosition('auto', false)).toBe('top')
    expect(resolveNavigationPosition('top', true)).toBe('top')
    expect(resolveNavigationPosition('bottom', false)).toBe('bottom')
  })

  it('lê a escolha guardada, e um armazenamento ausente ou recusado vale como automática', () => {
    expect(readNavigationPreference(memory({ [NAVIGATION_POSITION_KEY]: 'bottom' }))).toBe('bottom')
    expect(readNavigationPreference(memory({ [NAVIGATION_POSITION_KEY]: 'sideways' }))).toBe('auto')
    expect(readNavigationPreference(memory())).toBe('auto')
    expect(readNavigationPreference(refusing)).toBe('auto')
    expect(readNavigationPreference(null)).toBe('auto')
  })

  it('grava na chave da seção 6 do plano e diz quando não conseguiu', () => {
    const storage = memory()
    expect(writeNavigationPreference(storage, 'bottom')).toBe(true)
    expect(storage.values.get('hibi.ui.navigation-position.v1')).toBe('bottom')
    expect(writeNavigationPreference(storage, 'auto')).toBe(true)
    expect(storage.values.get('hibi.ui.navigation-position.v1')).toBe('auto')
    expect(writeNavigationPreference(refusing, 'bottom')).toBe(false)
    expect(writeNavigationPreference(null, 'top')).toBe(false)
  })
})

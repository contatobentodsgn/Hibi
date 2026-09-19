import { describe, expect, it } from 'vitest'
import { NAVIGATION_POSITION_KEY, parseNavigationPosition, readNavigationPosition, writeNavigationPosition } from '../shell/navigation-preferences'

const memory = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial))
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, values }
}
const refusing = { getItem: () => { throw new Error('bloqueado') }, setItem: () => { throw new Error('cota') } }

describe('posição da barra de navegação', () => {
  it('só aceita embaixo quando é exatamente "bottom"; o resto cai em cima', () => {
    expect(parseNavigationPosition('bottom')).toBe('bottom')
    expect(parseNavigationPosition('top')).toBe('top')
    for (const value of [null, undefined, '', 'BOTTOM', 'left', 'inferior', 1, {}, ['bottom']]) expect(parseNavigationPosition(value), String(value)).toBe('top')
  })

  it('lê a posição guardada, e um armazenamento ausente ou recusado vale em cima', () => {
    expect(readNavigationPosition(memory({ [NAVIGATION_POSITION_KEY]: 'bottom' }))).toBe('bottom')
    expect(readNavigationPosition(memory({ [NAVIGATION_POSITION_KEY]: 'sideways' }))).toBe('top')
    expect(readNavigationPosition(memory())).toBe('top')
    expect(readNavigationPosition(refusing)).toBe('top')
    expect(readNavigationPosition(null)).toBe('top')
  })

  it('grava na chave da seção 6 do plano e diz quando não conseguiu', () => {
    const storage = memory()
    expect(writeNavigationPosition(storage, 'bottom')).toBe(true)
    expect(storage.values.get('hibi.ui.navigation-position.v1')).toBe('bottom')
    expect(writeNavigationPosition(refusing, 'bottom')).toBe(false)
    expect(writeNavigationPosition(null, 'top')).toBe(false)
  })
})

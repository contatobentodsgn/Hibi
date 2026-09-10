import { describe, expect, it } from 'vitest'
import { dictionary, translate } from '../dictionary'

describe('dicionário', () => {
  it('tem as mesmas chaves em pt e en, sem strings vazias', () => {
    const pt = Object.keys(dictionary.pt).sort()
    const en = Object.keys(dictionary.en).sort()
    expect(en).toEqual(pt)
    for (const locale of ['pt', 'en'] as const) for (const [key, value] of Object.entries(dictionary[locale])) expect(value, `${locale}.${key}`).not.toBe('')
  })

  it('traduz pelo locale e usa pt como padrão', () => {
    expect(translate('pt', 'nav.tasks')).toBe('Tarefas')
    expect(translate('en', 'nav.tasks')).toBe('Tasks')
    expect(translate('pt', 'palette.title')).toBe('Paleta de comandos')
  })
})

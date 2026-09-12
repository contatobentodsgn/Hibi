import { describe, expect, it } from 'vitest'
import { DEFAULT_FOCUS_SETTINGS, FOCUS_SETTINGS_STORAGE_KEY, readFocusSettings, writeFocusSettings } from '../focus-settings'

const fakeStorage = (initial: string | null = null) => {
  const store = new Map<string, string>()
  if (initial !== null) store.set(FOCUS_SETTINGS_STORAGE_KEY, initial)
  return { store, storage: { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value) } } }
}

describe('focus-settings', () => {
  it('cai no padrão quando nada foi salvo — 25 minutos e 09:00–17:00', () => {
    expect(readFocusSettings(fakeStorage(null).storage)).toEqual(DEFAULT_FOCUS_SETTINGS)
  })

  it('os ajustes sobrevivem a recarregar', () => {
    const { store, storage } = fakeStorage(null)
    const chosen = { sessionMinutes: 50, activeStart: '08:30', activeEnd: '19:00', nudgePreset: 'calm' as const }
    writeFocusSettings(storage, chosen)

    // Uma leitura nova, do mesmo armazenamento, como aconteceria depois de fechar e reabrir o app.
    expect(readFocusSettings({ getItem: (key: string) => store.get(key) ?? null })).toEqual(chosen)
  })

  it('cai no padrão para JSON corrompido ou valor fora do conjunto conhecido', () => {
    expect(readFocusSettings(fakeStorage('{{{').storage)).toEqual(DEFAULT_FOCUS_SETTINGS)
    expect(readFocusSettings(fakeStorage('null').storage)).toEqual(DEFAULT_FOCUS_SETTINGS)
    expect(readFocusSettings(fakeStorage(JSON.stringify({ sessionMinutes: 7, nudgePreset: 'turbo', activeStart: '99:99' })).storage)).toEqual(DEFAULT_FOCUS_SETTINGS)
  })

  // Uma janela invertida silenciaria o dia inteiro, para sempre — pior do que ignorar o ajuste.
  it('cai no padrão para uma janela ativa invertida', () => {
    expect(readFocusSettings(fakeStorage(JSON.stringify({ activeStart: '20:00', activeEnd: '07:00' })).storage)).toEqual(DEFAULT_FOCUS_SETTINGS)
  })

  it('cai no padrão quando o armazenamento lança, e a escrita nunca derruba a tela', () => {
    expect(readFocusSettings({ getItem: () => { throw new Error('indisponível') } })).toEqual(DEFAULT_FOCUS_SETTINGS)
    expect(() => writeFocusSettings({ setItem: () => { throw new Error('indisponível') } }, DEFAULT_FOCUS_SETTINGS)).not.toThrow()
  })
})

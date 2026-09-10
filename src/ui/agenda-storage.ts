export type AgendaMode = 'day' | 'week'

export const AGENDA_VIEW_STORAGE_KEY = 'hibi-agenda-view'

export type AgendaHost = Readonly<{
  storage: Pick<Storage, 'getItem' | 'setItem'>
}>

export const readAgendaMode = (storage: Pick<Storage, 'getItem'>): AgendaMode => {
  try { return storage.getItem(AGENDA_VIEW_STORAGE_KEY) === 'week' ? 'week' : 'day' } catch { return 'day' }
}

export const writeAgendaMode = (storage: Pick<Storage, 'setItem'>, mode: AgendaMode): void => {
  try { storage.setItem(AGENDA_VIEW_STORAGE_KEY, mode) } catch { /* armazenamento indisponível */ }
}

const noopStorage: Pick<Storage, 'getItem' | 'setItem'> = { getItem: () => null, setItem: () => undefined }

// window.localStorage pode lançar (política de armazenamento restritiva, contexto embutido sem
// suporte); cai para no-op para o app sempre conseguir montar.
const safeStorage = (): Pick<Storage, 'getItem' | 'setItem'> => {
  try { return window.localStorage } catch { return noopStorage }
}

export const browserAgendaHost = (): AgendaHost => ({ storage: safeStorage() })

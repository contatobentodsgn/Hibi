import { describe, expect, it } from 'vitest'
import {
  WORKSPACE_MIGRATED_KEY,
  WORKSPACE_MIGRATION_LABEL,
  WORKSPACE_STORAGE_KEY,
  createDesktopWorkspaceBackend,
  createWorkspaceStore,
  type WorkspaceBackend,
} from '../workspace-store'

const storageWith = (entries: Record<string, string> = {}) => {
  const values = new Map(Object.entries(entries))
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
}
const failingStorage = () => ({
  values: new Map<string, string>(),
  getItem: () => { throw new Error('armazenamento indisponível') },
  setItem: () => { throw new Error('cota estourada') },
})
const databaseWith = (initial: string | null = null): WorkspaceBackend & { payload: string | null; saves: { payload: string; restorePoint?: string }[] } => {
  const saves: { payload: string; restorePoint?: string }[] = []
  const database = {
    payload: initial,
    saves,
    read: async () => database.payload,
    save: async (payload: string, options?: { restorePoint?: string }) => {
      saves.push({ payload, ...(options?.restorePoint ? { restorePoint: options.restorePoint } : {}) })
      database.payload = payload
    },
  }
  return database
}
const workspace = (title: string) => JSON.stringify({ tasks: [{ id: '1', title }] })

describe('workspace store', () => {
  it('sem a ponte do desktop, lê e grava no armazenamento local, como antes', async () => {
    const storage = storageWith({ [WORKSPACE_STORAGE_KEY]: workspace('antigo') })
    const store = createWorkspaceStore({ storage })

    expect(await store.load()).toEqual({ payload: workspace('antigo'), origin: 'local', migrated: false })
    expect(await store.save(workspace('novo'))).toEqual({ origin: 'local' })
    expect(storage.values.get(WORKSPACE_STORAGE_KEY)).toBe(workspace('novo'))
    expect(storage.values.has(WORKSPACE_MIGRATED_KEY)).toBe(false)
  })

  it('migra uma única vez o que já estava no armazenamento local, com ponto de restauração', async () => {
    const storage = storageWith({ [WORKSPACE_STORAGE_KEY]: workspace('do localStorage') })
    const database = databaseWith(null)
    const store = createWorkspaceStore({ storage, database })

    const first = await store.load()
    expect(first).toEqual({ payload: workspace('do localStorage'), origin: 'database', migrated: true })
    expect(database.saves).toEqual([{ payload: workspace('do localStorage'), restorePoint: WORKSPACE_MIGRATION_LABEL }])
    expect(storage.values.get(WORKSPACE_MIGRATED_KEY)).toBe('true')

    // Uma segunda abertura com o banco vazio não repete a migração: o banco vazio passou a ser a verdade.
    database.payload = null
    const second = await store.load()
    expect(second).toEqual({ payload: null, origin: 'empty', migrated: false })
    expect(database.saves).toHaveLength(1)
  })

  it('com o banco já preenchido, é ele que vale, e o local não migra por cima', async () => {
    const storage = storageWith({ [WORKSPACE_STORAGE_KEY]: workspace('local desatualizado') })
    const database = databaseWith(workspace('do banco'))
    const store = createWorkspaceStore({ storage, database })

    expect(await store.load()).toEqual({ payload: workspace('do banco'), origin: 'database', migrated: false })
    expect(database.saves).toEqual([])
  })

  it('grava no banco e espelha no armazenamento local, repassando o rótulo do ponto', async () => {
    const storage = storageWith()
    const database = databaseWith(workspace('inicial'))
    const store = createWorkspaceStore({ storage, database })

    expect(await store.save(workspace('depois'), { restorePoint: 'importação' })).toEqual({ origin: 'database' })

    expect(database.saves).toEqual([{ payload: workspace('depois'), restorePoint: 'importação' }])
    // O espelho é a saída de emergência: voltar para uma versão anterior do app ainda encontra o workspace.
    expect(storage.values.get(WORKSPACE_STORAGE_KEY)).toBe(workspace('depois'))
  })

  it('banco que falha na leitura abre com o espelho local e avisa', async () => {
    const storage = storageWith({ [WORKSPACE_STORAGE_KEY]: workspace('espelho') })
    const store = createWorkspaceStore({
      storage,
      database: { read: async () => { throw new Error('banco travado') }, save: async () => undefined },
    })

    expect(await store.load()).toEqual({ payload: workspace('espelho'), origin: 'local', migrated: false, degraded: 'banco travado' })
  })

  it('banco que falha na gravação mantém o dado no armazenamento local e avisa', async () => {
    const storage = storageWith()
    const store = createWorkspaceStore({
      storage,
      database: { read: async () => null, save: async () => { throw new Error('disco cheio') } },
    })

    expect(await store.save(workspace('em risco'))).toEqual({ origin: 'local', degraded: 'disco cheio' })
    expect(storage.values.get(WORKSPACE_STORAGE_KEY)).toBe(workspace('em risco'))
  })

  it('armazenamento local indisponível não derruba a gravação no banco', async () => {
    const database = databaseWith(null)
    const store = createWorkspaceStore({ storage: failingStorage(), database })

    expect(await store.load()).toEqual({ payload: null, origin: 'empty', migrated: false })
    expect(await store.save(workspace('só no banco'))).toEqual({ origin: 'database', degraded: 'local storage is unavailable' })
    expect(database.payload).toBe(workspace('só no banco'))
  })

  it('a ponte do desktop só existe quando os dois canais existem', async () => {
    expect(createDesktopWorkspaceBackend(undefined)).toBeNull()
    expect(createDesktopWorkspaceBackend({ readWorkspace: async () => null })).toBeNull()
    expect(createDesktopWorkspaceBackend({ saveWorkspace: async () => ({ updatedAt: 'agora' }) })).toBeNull()

    const calls: unknown[] = []
    const backend = createDesktopWorkspaceBackend({
      readWorkspace: async () => ({ payload: workspace('da ponte'), updatedAt: 'agora' }),
      saveWorkspace: async (input) => { calls.push(input); return { updatedAt: 'agora' } },
    })

    expect(await backend?.read()).toBe(workspace('da ponte'))
    await backend?.save(workspace('novo'))
    await backend?.save(workspace('com ponto'), { restorePoint: 'lote' })
    expect(calls).toEqual([{ payload: workspace('novo') }, { payload: workspace('com ponto'), restorePoint: 'lote' }])
  })

  it('a ponte devolve nulo quando o banco está vazio, sem inventar payload', async () => {
    const backend = createDesktopWorkspaceBackend({ readWorkspace: async () => null, saveWorkspace: async () => ({ updatedAt: 'agora' }) })
    expect(await backend?.read()).toBeNull()
  })
})

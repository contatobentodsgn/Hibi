import { describe, expect, it } from 'vitest'
import {
  WORKSPACE_MIGRATED_KEY,
  WORKSPACE_MIGRATION_LABEL,
  WORKSPACE_PENDING_KEY,
  WORKSPACE_STORAGE_KEY,
  WORKSPACE_RESTORE_POINT_KEYS,
  createDesktopWorkspaceBackend,
  createWorkspaceSession,
  createWorkspaceStore,
  restorePointLabelKey,
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
    // O espelho passa a valer o que o banco tem: é o que a versão anterior do app vai encontrar.
    expect(storage.values.get(WORKSPACE_STORAGE_KEY)).toBe(workspace('do banco'))
  })

  it('o espelho acompanha o banco mesmo quando não havia nada no armazenamento local', async () => {
    const storage = storageWith()
    const store = createWorkspaceStore({ storage, database: databaseWith(workspace('do banco')) })

    expect(await store.load()).toEqual({ payload: workspace('do banco'), origin: 'database', migrated: false })
    expect(storage.values.get(WORKSPACE_STORAGE_KEY)).toBe(workspace('do banco'))
  })

  it('espelho indisponível não impede o banco de valer', async () => {
    const store = createWorkspaceStore({ storage: failingStorage(), database: databaseWith(workspace('do banco')) })

    expect(await store.load()).toEqual({ payload: workspace('do banco'), origin: 'database', migrated: false })
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

  it('a sessão recusa gravar antes da primeira leitura, para o espelho local não subir por cima do banco', async () => {
    const database = databaseWith(workspace('no banco'))
    // O espelho está velho: é o caso de logo depois de restaurar um ponto, ou de outra janela ter gravado.
    const storage = storageWith({ [WORKSPACE_STORAGE_KEY]: workspace('espelho velho') })
    let liberarLeitura = () => {}
    const store = createWorkspaceStore({ storage, database: { ...database, read: async () => { await new Promise<void>((resolve) => { liberarLeitura = resolve }); return database.payload } } })
    const session = createWorkspaceSession(store)

    const leitura = session.start()
    expect(await session.save(workspace('em memória'))).toBe(null)
    expect(database.saves).toEqual([])
    // O espelho continua sendo escrito na hora, como antes do banco existir: quem abre o app numa
    // versão anterior, ou sem a ponte, encontra o workspace no lugar antigo mesmo assim.
    expect(storage.values.get(WORKSPACE_STORAGE_KEY)).toBe(workspace('em memória'))

    liberarLeitura()
    expect(await leitura).toEqual({ payload: workspace('no banco'), origin: 'database', migrated: false })
    expect(database.payload).toBe(workspace('no banco'))
  })

  it('a sessão não regrava o que acabou de ler', async () => {
    const database = databaseWith(workspace('no banco'))
    const session = createWorkspaceSession(createWorkspaceStore({ storage: storageWith(), database }))

    const lido = await session.start()

    expect(await session.save(lido.payload!)).toBe(null)
    expect(database.saves).toEqual([])
    // Um ponto de restauração pedido de propósito continua valendo, mesmo com o conteúdo igual.
    expect(await session.save(lido.payload!, { restorePoint: 'antes do lote' })).toEqual({ origin: 'database' })
    expect(database.saves).toEqual([{ payload: workspace('no banco'), restorePoint: 'antes do lote' }])
  })

  it('depois da leitura, a sessão grava normalmente e repassa o rótulo do ponto', async () => {
    const database = databaseWith(workspace('no banco'))
    const session = createWorkspaceSession(createWorkspaceStore({ storage: storageWith(), database }))

    await session.start()

    expect(await session.save(workspace('novo'), { restorePoint: 'antes do lote' })).toEqual({ origin: 'database' })
    expect(database.saves).toEqual([{ payload: workspace('novo'), restorePoint: 'antes do lote' }])
    // O efeito do App corre a cada render; repetir o mesmo conteúdo não vira gravação nova.
    expect(await session.save(workspace('novo'))).toBe(null)
    expect(database.saves).toHaveLength(1)
  })

  it('sem a ponte, não há pontos de restauração para listar nem para restaurar', async () => {
    const store = createWorkspaceStore({ storage: storageWith() })

    expect(await store.restorePoints()).toEqual([])
    await expect(store.restore(3)).rejects.toThrow(/desktop bridge/)
  })

  it('lista os pontos do banco e restaura um deles, atualizando o espelho local', async () => {
    const pontos = [{ id: 2, label: 'antes da importação', createdAt: '2026-09-16T12:00:00.000Z', bytes: 120 }]
    const database = databaseWith(workspace('agora'))
    const storage = storageWith({ [WORKSPACE_STORAGE_KEY]: workspace('agora') })
    const store = createWorkspaceStore({ storage, database: { ...database, restorePoints: async () => pontos, restore: async (id: number) => { expect(id).toBe(2); return workspace('restaurado') } } })

    expect(await store.restorePoints()).toEqual(pontos)
    expect(await store.restore(2)).toBe(workspace('restaurado'))
    // Sem isto, a primeira gravação depois da restauração devolveria o espelho velho ao banco.
    expect(storage.values.get(WORKSPACE_STORAGE_KEY)).toBe(workspace('restaurado'))
  })

  it('a ponte expõe os pontos de restauração só quando os canais existem', async () => {
    const semPontos = createDesktopWorkspaceBackend({ readWorkspace: async () => null, saveWorkspace: async () => ({ updatedAt: '2026-09-16T12:00:00.000Z' }) })
    expect(semPontos?.restorePoints).toBe(undefined)
    expect(semPontos?.restore).toBe(undefined)

    const completa = createDesktopWorkspaceBackend({
      readWorkspace: async () => null,
      saveWorkspace: async () => ({ updatedAt: '2026-09-16T12:00:00.000Z' }),
      listWorkspaceRestorePoints: async () => [{ id: 1, label: 'migração', createdAt: '2026-09-16T12:00:00.000Z', bytes: 10 }],
      restoreWorkspace: async ({ id }) => ({ payload: workspace(`ponto ${id}`), updatedAt: '2026-09-16T12:00:00.000Z' }),
    })

    expect(await completa?.restorePoints?.()).toEqual([{ id: 1, label: 'migração', createdAt: '2026-09-16T12:00:00.000Z', bytes: 10 }])
    expect(await completa?.restore?.(7)).toBe(workspace('ponto 7'))
  })

  it('um ponto pedido antes da ação destrutiva rotula a gravação seguinte, e só ela', async () => {
    const database = databaseWith(workspace('antes'))
    const session = createWorkspaceSession(createWorkspaceStore({ storage: storageWith(), database }))
    await session.start()

    session.markRestorePoint('antes de apagar todos os dados')
    expect(await session.save(workspace('depois'))).toEqual({ origin: 'database' })
    expect(await session.save(workspace('mais uma mudança'))).toEqual({ origin: 'database' })

    expect(database.saves).toEqual([
      { payload: workspace('depois'), restorePoint: 'antes de apagar todos os dados' },
      { payload: workspace('mais uma mudança') },
    ])
  })

  it('o rótulo espera a primeira gravação no banco, mesmo que a leitura ainda não tenha terminado', async () => {
    const database = databaseWith(null)
    let liberarLeitura = () => {}
    const store = createWorkspaceStore({ storage: storageWith(), database: { ...database, read: async () => { await new Promise<void>((resolve) => { liberarLeitura = resolve }); return database.payload } } })
    const session = createWorkspaceSession(store)

    const leitura = session.start()
    session.markRestorePoint('antes de restaurar um backup')
    // Esta gravação só chega ao espelho; perder o rótulo aqui deixaria a ação destrutiva sem ponto.
    expect(await session.save(workspace('durante a leitura'))).toBe(null)
    liberarLeitura()
    await leitura

    expect(await session.save(workspace('depois da leitura'))).toEqual({ origin: 'database' })
    expect(database.saves).toEqual([{ payload: workspace('depois da leitura'), restorePoint: 'antes de restaurar um backup' }])
  })

  it('com o rótulo pedido, até um conteúdo idêntico ao lido vira gravação, para o ponto existir', async () => {
    const database = databaseWith(workspace('igual'))
    const session = createWorkspaceSession(createWorkspaceStore({ storage: storageWith(), database }))
    const lido = await session.start()

    session.markRestorePoint('antes de restaurar um backup')

    expect(await session.save(lido.payload!)).toEqual({ origin: 'database' })
    expect(database.saves).toEqual([{ payload: workspace('igual'), restorePoint: 'antes de restaurar um backup' }])
  })

  it('o rótulo de um ponto é a chave do dicionário, não a frase', async () => {
    const database = databaseWith()
    const storage = storageWith({ [WORKSPACE_STORAGE_KEY]: workspace('local') })
    const store = createWorkspaceStore({ storage, database })
    const session = createWorkspaceSession(store)

    await session.start()
    session.markRestorePoint(WORKSPACE_RESTORE_POINT_KEYS.beforeReset)
    await session.save(workspace('depois de apagar'))

    expect(database.saves.map((entry) => entry.restorePoint)).toEqual([
      'data.restorePoint.migration',
      'data.restorePoint.beforeReset',
    ])
  })

  it('traduz o rótulo conhecido e devolve nulo para o que não conhece', () => {
    expect(restorePointLabelKey('data.restorePoint.beforeRestore')).toBe('data.restorePoint.beforeRestore')

    // Pontos gravados antes desta mudança guardam a frase, inclusive a que o próprio banco criava.
    expect(restorePointLabelKey('antes de apagar todos os dados')).toBe('data.restorePoint.beforeReset')
    expect(restorePointLabelKey('Antes de restaurar um backup')).toBe('data.restorePoint.beforeRestore')
    expect(restorePointLabelKey('migração do armazenamento local')).toBe('data.restorePoint.migration')
    expect(restorePointLabelKey('before-restore')).toBe('data.restorePoint.beforeRollback')

    // Sem correspondência, quem mostra a lista exibe o texto como veio, em vez de sumir com a linha.
    expect(restorePointLabelKey('ponto de uma versão futura')).toBe(null)
    expect(restorePointLabelKey('')).toBe(null)
  })
})

// Um banco que recusa uma gravação deixava a mudança só no espelho; na abertura seguinte o banco,
// ainda com o estado anterior, sobrescrevia o espelho e a sessão inteira se perdia.
describe('mudanças que o banco recusou', () => {
  const bancoQueRecusa = (inicial: string) => {
    const banco = databaseWith(inicial)
    let recusar = true
    // O mesmo banco, que recusa gravar até `voltar()`: `banco` continua sendo o que se inspeciona.
    const backend: WorkspaceBackend = { ...banco, save: async (payload: string, options?: { restorePoint?: string }) => { if (recusar) throw new Error('disco cheio'); return banco.save(payload, options) } }
    return { banco, backend, voltar: () => { recusar = false } }
  }

  it('sobrevivem à reabertura: o espelho vai para o banco, com ponto do que estava lá', async () => {
    const storage = storageWith()
    const { banco, backend, voltar } = bancoQueRecusa(workspace('antes'))
    const sessao = createWorkspaceStore({ storage, database: backend })

    expect(await sessao.save(workspace('feito com o banco falhando'))).toMatchObject({ origin: 'local', degraded: 'disco cheio' })
    voltar()
    const reaberto = await createWorkspaceStore({ storage, database: backend }).load()

    expect(reaberto.payload).toBe(workspace('feito com o banco falhando'))
    expect(banco.payload).toBe(workspace('feito com o banco falhando'))
    expect(banco.saves.at(-1)?.restorePoint).toBe(WORKSPACE_RESTORE_POINT_KEYS.beforeRecovery)
  })

  it('depois de recuperadas, a abertura seguinte volta a confiar no banco', async () => {
    const storage = storageWith()
    const { banco, backend, voltar } = bancoQueRecusa(workspace('antes'))
    await createWorkspaceStore({ storage, database: backend }).save(workspace('recusado'))
    voltar()
    await createWorkspaceStore({ storage, database: backend }).load()
    banco.payload = workspace('mudou no banco depois')

    expect((await createWorkspaceStore({ storage, database: backend }).load()).payload).toBe(workspace('mudou no banco depois'))
  })

  it('se o banco recusar de novo ao reabrir, o espelho continua valendo e a recuperação fica pendente', async () => {
    const storage = storageWith()
    const { backend } = bancoQueRecusa(workspace('antes'))
    await createWorkspaceStore({ storage, database: backend }).save(workspace('recusado'))

    const reaberto = await createWorkspaceStore({ storage, database: backend }).load()

    expect(reaberto).toMatchObject({ payload: workspace('recusado'), origin: 'local', degraded: 'disco cheio' })
    expect(storage.values.get(WORKSPACE_PENDING_KEY)).toBe('true')
  })

  it('uma gravação que dá certo tira a pendência, e o banco volta a valer', async () => {
    const storage = storageWith()
    const { banco, backend, voltar } = bancoQueRecusa(workspace('antes'))
    const sessao = createWorkspaceStore({ storage, database: backend })
    await sessao.save(workspace('recusado'))
    voltar()
    await sessao.save(workspace('aceito'))
    banco.payload = workspace('mais novo no banco')

    expect((await createWorkspaceStore({ storage, database: backend }).load()).payload).toBe(workspace('mais novo no banco'))
  })

  it('o ponto criado na recuperação tem rótulo legível', () => {
    expect(restorePointLabelKey(WORKSPACE_RESTORE_POINT_KEYS.beforeRecovery)).toBe('data.restorePoint.beforeRecovery')
  })
})

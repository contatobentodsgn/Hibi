/**
 * De onde o workspace é lido e para onde ele é gravado.
 *
 * Hoje ele vive numa chave do `localStorage`, regravada inteira a cada mudança: uma cota estourada ou
 * uma aba fechada no meio da escrita leva tudo junto, e não existe voltar atrás depois de um lote ou de
 * uma migração. O banco do processo principal (`electron/workspace-database.cjs`) resolve isso, e este
 * adaptador é a porta entre os dois mundos.
 *
 * Três regras guiam o desenho:
 *
 * 1. **Sem a ponte, nada muda.** No navegador, e enquanto os canais não existirem, tudo continua no
 *    `localStorage`, exatamente como antes.
 * 2. **A migração acontece uma vez e guarda um ponto de restauração.** O que já está no `localStorage`
 *    entra no banco antes de qualquer gravação nova.
 * 3. **O `localStorage` continua sendo escrito como espelho.** Ele é a saída de emergência enquanto o
 *    banco é novidade: se a pessoa voltar para uma versão anterior do app, encontra o workspace no
 *    lugar antigo.
 */

export const WORKSPACE_STORAGE_KEY = 'hibi-study-data'
export const WORKSPACE_MIGRATED_KEY = 'hibi-study-data-migrated'
export const WORKSPACE_MIGRATION_LABEL = 'migração do armazenamento local'

export type WorkspaceSaveOptions = Readonly<{ restorePoint?: string }>
export type WorkspaceRestorePoint = Readonly<{ id: number; label: string; createdAt: string; bytes: number }>
export type WorkspaceBackend = Readonly<{
  read: () => Promise<string | null>
  save: (payload: string, options?: WorkspaceSaveOptions) => Promise<void>
  restorePoints?: () => Promise<readonly WorkspaceRestorePoint[]>
  restore?: (id: number) => Promise<string>
}>

/** De onde veio o que foi lido, e onde a gravação caiu. O App usa isso para avisar uma vez. */
export type WorkspaceOrigin = 'database' | 'local' | 'empty'
export type WorkspaceLoad = Readonly<{ payload: string | null; origin: WorkspaceOrigin; migrated: boolean; degraded?: string }>
export type WorkspaceSave = Readonly<{ origin: Exclude<WorkspaceOrigin, 'empty'>; degraded?: string }>

type LocalStorageLike = Pick<Storage, 'getItem' | 'setItem'>
type DesktopBridge = Readonly<{
  readWorkspace?: () => Promise<{ payload: string; updatedAt: string } | null>
  saveWorkspace?: (input: { payload: string; restorePoint?: string }) => Promise<{ updatedAt: string }>
  listWorkspaceRestorePoints?: () => Promise<readonly WorkspaceRestorePoint[]>
  restoreWorkspace?: (input: { id: number }) => Promise<{ payload: string; updatedAt: string }>
}>

const message = (error: unknown) => (error instanceof Error ? error.message : 'unknown failure')

/** A ponte do desktop, quando os dois canais existem. `null` no navegador e antes de eles existirem. */
export function createDesktopWorkspaceBackend(bridge: DesktopBridge | undefined): WorkspaceBackend | null {
  const read = bridge?.readWorkspace
  const save = bridge?.saveWorkspace
  if (typeof read !== 'function' || typeof save !== 'function') return null
  const list = bridge?.listWorkspaceRestorePoints
  const restore = bridge?.restoreWorkspace
  return {
    read: async () => (await read())?.payload ?? null,
    save: async (payload, options) => { await save({ payload, ...(options?.restorePoint ? { restorePoint: options.restorePoint } : {}) }) },
    // Os pontos de restauração são do banco: sem eles a lista fica vazia e restaurar recusa.
    ...(typeof list === 'function' ? { restorePoints: () => list() } : {}),
    ...(typeof restore === 'function' ? { restore: async (id: number) => (await restore({ id })).payload } : {}),
  }
}

export function createWorkspaceStore({ storage, database }: { storage: LocalStorageLike; database?: WorkspaceBackend | null }) {
  const readLocal = () => {
    try { return storage.getItem(WORKSPACE_STORAGE_KEY) } catch { return null }
  }
  const writeLocal = (payload: string) => {
    try { storage.setItem(WORKSPACE_STORAGE_KEY, payload); return true } catch { return false }
  }
  const alreadyMigrated = () => {
    try { return storage.getItem(WORKSPACE_MIGRATED_KEY) === 'true' } catch { return false }
  }

  return {
    async load(): Promise<WorkspaceLoad> {
      const local = readLocal()
      if (!database) return { payload: local, origin: local ? 'local' : 'empty', migrated: false }
      let stored: string | null
      try {
        stored = await database.read()
      } catch (error) {
        // Sem leitura do banco, o espelho local ainda serve: o app abre com os dados, avisando.
        return { payload: local, origin: local ? 'local' : 'empty', migrated: false, degraded: message(error) }
      }
      if (stored !== null) return { payload: stored, origin: 'database', migrated: false }
      if (local === null || alreadyMigrated()) return { payload: null, origin: 'empty', migrated: false }
      try {
        // O que já existia entra no banco antes de qualquer gravação nova, com ponto de restauração.
        await database.save(local, { restorePoint: WORKSPACE_MIGRATION_LABEL })
        try { storage.setItem(WORKSPACE_MIGRATED_KEY, 'true') } catch { /* migração repetida é inofensiva */ }
        return { payload: local, origin: 'database', migrated: true }
      } catch (error) {
        return { payload: local, origin: 'local', migrated: false, degraded: message(error) }
      }
    },

    async save(payload: string, options?: WorkspaceSaveOptions): Promise<WorkspaceSave> {
      if (!database) {
        if (writeLocal(payload)) return { origin: 'local' }
        return { origin: 'local', degraded: 'local storage is unavailable' }
      }
      try {
        await database.save(payload, options)
      } catch (error) {
        // O banco falhou: o espelho local vira o único registro, e quem chama precisa saber.
        writeLocal(payload)
        return { origin: 'local', degraded: message(error) }
      }
      const mirrored = writeLocal(payload)
      return mirrored ? { origin: 'database' } : { origin: 'database', degraded: 'local storage is unavailable' }
    },

    /** Só o espelho local, sem tocar no banco. É o que vale antes da primeira leitura. */
    mirror(payload: string): boolean { return writeLocal(payload) },

    /** Os pontos guardados pelo banco, do mais novo para o mais velho. Vazio sem a ponte. */
    async restorePoints(): Promise<readonly WorkspaceRestorePoint[]> {
      if (!database?.restorePoints) return []
      return database.restorePoints()
    },

    /**
     * Volta o banco a um ponto e devolve o que passou a valer. O espelho local acompanha na hora:
     * se ficasse para trás, a primeira gravação depois da restauração o mandaria de volta por cima
     * do que acabou de ser restaurado. Quem chama ainda precisa recarregar a janela, porque o estado
     * em memória é anterior à restauração.
     */
    async restore(id: number): Promise<string> {
      if (!database?.restore) throw new Error('Restore points need the desktop bridge.')
      const payload = await database.restore(id)
      writeLocal(payload)
      return payload
    },
  }
}

export type WorkspaceStore = ReturnType<typeof createWorkspaceStore>

/**
 * A sessão do App em volta do armazenamento. Existe por causa de uma ordem: a leitura do banco é
 * assíncrona, e o App já tem dados em memória (o espelho local) antes de ela terminar. Gravar nessa
 * janela sobrescreveria o banco com o espelho — que pode estar velho, por exemplo logo depois de
 * restaurar um ponto. Então, antes da primeira leitura, a gravação vai só para o espelho local, como
 * era antes do banco existir, e devolve `null`; o App regrava assim que a leitura termina.
 */
export function createWorkspaceSession(store: WorkspaceStore) {
  let started = false
  let written: string | null = null
  return {
    async start(): Promise<WorkspaceLoad> {
      const result = await store.load()
      started = true
      // O que acabou de ser lido já está gravado. Sem isto, a primeira gravação depois da leitura
      // devolveria ao armazenamento o mesmo conteúdo — e, pior, o conteúdo que o App tinha em
      // memória antes de ler, que pode ser mais velho do que o de lá.
      written = result.payload
      return result
    },
    async save(payload: string, options?: WorkspaceSaveOptions): Promise<WorkspaceSave | null> {
      if (!started) { store.mirror(payload); return null }
      if (payload === written && !options?.restorePoint) return null
      written = payload
      return store.save(payload, options)
    },
  }
}

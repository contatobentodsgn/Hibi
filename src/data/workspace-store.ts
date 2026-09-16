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
export type WorkspaceBackend = Readonly<{
  read: () => Promise<string | null>
  save: (payload: string, options?: WorkspaceSaveOptions) => Promise<void>
}>

/** De onde veio o que foi lido, e onde a gravação caiu. O App usa isso para avisar uma vez. */
export type WorkspaceOrigin = 'database' | 'local' | 'empty'
export type WorkspaceLoad = Readonly<{ payload: string | null; origin: WorkspaceOrigin; migrated: boolean; degraded?: string }>
export type WorkspaceSave = Readonly<{ origin: Exclude<WorkspaceOrigin, 'empty'>; degraded?: string }>

type LocalStorageLike = Pick<Storage, 'getItem' | 'setItem'>
type DesktopBridge = Readonly<{
  readWorkspace?: () => Promise<{ payload: string; updatedAt: string } | null>
  saveWorkspace?: (input: { payload: string; restorePoint?: string }) => Promise<{ updatedAt: string }>
}>

const message = (error: unknown) => (error instanceof Error ? error.message : 'unknown failure')

/** A ponte do desktop, quando os dois canais existem. `null` no navegador e antes de eles existirem. */
export function createDesktopWorkspaceBackend(bridge: DesktopBridge | undefined): WorkspaceBackend | null {
  const read = bridge?.readWorkspace
  const save = bridge?.saveWorkspace
  if (typeof read !== 'function' || typeof save !== 'function') return null
  return {
    read: async () => (await read())?.payload ?? null,
    save: async (payload, options) => { await save({ payload, ...(options?.restorePoint ? { restorePoint: options.restorePoint } : {}) }) },
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
  }
}

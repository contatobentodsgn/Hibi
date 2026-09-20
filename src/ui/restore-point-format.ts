import { restorePointLabelKey, type WorkspaceRestorePoint } from '../data/workspace-store'
import type { DictionaryKey } from '../i18n/dictionary'
import type { Locale } from '../i18n/format'

type Translate = (key: DictionaryKey) => string

/** O que a tela precisa saber da ponte: se ela sabe listar pontos. Nada mais. */
export type RestorePointBridge = Readonly<{ listWorkspaceRestorePoints?: unknown }>

/**
 * O rótulo gravado é a **chave** do dicionário, e os pontos antigos guardam a frase — `restorePointLabelKey`
 * reconhece as duas. Um rótulo que ninguém reconhece aparece como veio, em vez de sumir da linha.
 */
export function restorePointText(point: WorkspaceRestorePoint, t: Translate): string {
  const key = restorePointLabelKey(point.label)
  return key ? t(key) : point.label
}

/** A data no idioma da interface. Um carimbo que a plataforma não entende aparece como veio. */
export function restorePointDate(value: string, language: Locale): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  try {
    return new Intl.DateTimeFormat(language === 'pt' ? 'pt-BR' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed)
  } catch {
    return value
  }
}

export function restorePointSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * A lista vazia tem duas causas, e cada uma pede um texto diferente. `restorePoints()` não rejeita sem a
 * ponte: ela resolve `[]` por desenho, então a lista vazia sozinha não distingue nada. Sem a ponte os
 * pontos não existem aqui; com a ponte, ainda não houve nenhum — e aí mandar abrir o app de desktop
 * manda a pessoa abrir o app que ela já está usando.
 */
export function restorePointsEmptyKey(bridge: RestorePointBridge | undefined): DictionaryKey {
  return typeof bridge?.listWorkspaceRestorePoints === 'function' ? 'data.restorePoints.empty' : 'data.restorePoints.desktopOnly'
}

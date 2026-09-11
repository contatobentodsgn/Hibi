import { pruneConversations, sanitizeConversation, type Conversation } from '../domain/conversations'

export const CONVERSATIONS_STORAGE_KEY = 'hibi-conversations'

/** Fora do `StudyData` de propósito: o backup do workspace serializa o StudyData inteiro. */
export function loadConversations(storage: Pick<Storage, 'getItem'>): readonly Conversation[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(CONVERSATIONS_STORAGE_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return pruneConversations(parsed.map(sanitizeConversation).filter((item): item is Conversation => Boolean(item)))
  } catch { return [] }
}

// Devolve `false` em vez de lançar: perder a gravação não pode derrubar a conversa em andamento,
// mas também não pode passar em silêncio — quem chama avisa uma vez.
export function saveConversations(storage: Pick<Storage, 'setItem'>, conversations: readonly Conversation[]): boolean {
  try {
    storage.setItem(CONVERSATIONS_STORAGE_KEY, JSON.stringify(pruneConversations(conversations)))
    return true
  } catch { return false }
}

export type ConversationMessage = Readonly<{ role: 'user' | 'assistant'; text: string; at: string; provenance?: string }>
export type Conversation = Readonly<{ id: string; title: string; createdAt: string; updatedAt: string; messages: readonly ConversationMessage[] }>

const TITLE_LIMIT = 60

/** Um rótulo curto tirado da primeira mensagem: nunca custa uma chamada ao modelo. */
export function titleFor(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= TITLE_LIMIT) return clean || 'Conversa'
  const cut = clean.slice(0, TITLE_LIMIT - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > TITLE_LIMIT / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

export function createConversation(firstMessage: string, at: string, id: string): Conversation {
  const text = redactSecrets(firstMessage)
  return { id, title: titleFor(text), createdAt: at, updatedAt: at, messages: [{ role: 'user', text, at }] }
}

export function appendMessage(conversation: Conversation, message: ConversationMessage): Conversation {
  return { ...conversation, updatedAt: message.at, messages: [...conversation.messages, { ...message, text: redactSecrets(message.text) }] }
}

// Mesma regra do histórico da IA (`src/ai/history.ts`): uma credencial colada por engano não
// chega ao armazenamento. A conversa é gravada inteira; só o segredo é substituído.
export const redactSecrets = (value: string): string => value
  .replace(/(?:Bearer\s+|sk-|gsk_)[^\s,;]+/gi, '[redacted]')
  .replace(/(?:api[_-]?key|token)\s*[:=]\s*[^\s,;]+/gi, '[redacted]')

const isRole = (value: unknown): value is ConversationMessage['role'] => value === 'user' || value === 'assistant'
const isIsoDate = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value))

const sanitizeMessage = (value: unknown): ConversationMessage | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  if (!isRole(record.role) || typeof record.text !== 'string' || !isIsoDate(record.at)) return undefined
  const provenance = typeof record.provenance === 'string' && record.provenance ? record.provenance.slice(0, 240) : undefined
  return { role: record.role, text: redactSecrets(record.text), at: record.at, ...(provenance ? { provenance } : {}) }
}

/** Um registro corrompido é descartado sozinho; os demais sobrevivem. */
export function sanitizeConversation(value: unknown): Conversation | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || !record.id || typeof record.title !== 'string') return undefined
  if (!isIsoDate(record.createdAt) || !isIsoDate(record.updatedAt) || !Array.isArray(record.messages)) return undefined
  const messages = record.messages.map(sanitizeMessage)
  if (messages.some((message) => message === undefined)) return undefined
  return { id: record.id, title: record.title.slice(0, 120), createdAt: record.createdAt, updatedAt: record.updatedAt, messages: messages as ConversationMessage[] }
}

export const MAX_CONVERSATIONS = 50

/** Busca no que foi dito: procurar só no título esconderia a conversa que interessa. */
export function searchConversations(conversations: readonly Conversation[], query: string): readonly Conversation[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return conversations
  return conversations.filter((conversation) =>
    conversation.title.toLowerCase().includes(needle) || conversation.messages.some((message) => message.text.toLowerCase().includes(needle)))
}

/** Mais recente primeiro; a mais antiga cai ao estourar o teto. Compara instantes, não texto:
 * `2026-09-11T09:00:00-03:00` vem depois de `2026-09-11T10:00:00.000Z`, mas ordena antes como string. */
export function pruneConversations(conversations: readonly Conversation[], { maxConversations = MAX_CONVERSATIONS } = {}): readonly Conversation[] {
  return [...conversations].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)).slice(0, maxConversations)
}

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
  return { id, title: titleFor(firstMessage), createdAt: at, updatedAt: at, messages: [{ role: 'user', text: firstMessage, at }] }
}

export function appendMessage(conversation: Conversation, message: ConversationMessage): Conversation {
  return { ...conversation, updatedAt: message.at, messages: [...conversation.messages, message] }
}

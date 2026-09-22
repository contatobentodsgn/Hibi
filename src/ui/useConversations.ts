import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { provenanceLabel, type AssistantTurnState } from '../ai/assistant-turn'
import { loadConversations, saveConversations } from '../data/conversation-store'
import { appendMessage, createConversation, type Conversation, type ConversationMessage } from '../domain/conversations'
import type { AssistantTurnControls } from './useAssistantTurn'

export type ConversationState = Readonly<{ conversations: readonly Conversation[]; activeId: string | null }>

export type ConversationsController = Readonly<{
  conversations: readonly Conversation[]
  activeId: string | null
  query: string
  saveFailed: boolean
  record: (message: ConversationMessage) => void
  select: (id: string) => void
  create: () => void
  remove: (id: string) => void
  removeAll: () => void
  search: (query: string) => void
}>

export type ConversationsHost = Readonly<{
  storage?: Pick<Storage, 'getItem' | 'setItem'>
  turn?: AssistantTurnControls
  onEvent?: (action: string, detail: string, result?: string) => void
}>

const sameMessage = (left: ConversationMessage, right: ConversationMessage) =>
  left.role === right.role && left.at === right.at && left.text === right.text

/** Escrita única: a mesma transição chegando duas vezes devolve o estado intocado. */
export function recordTurn(state: ConversationState, message: ConversationMessage, nextId: string): ConversationState {
  const active = state.conversations.find((conversation) => conversation.id === state.activeId)
  if (!active) return { conversations: [createConversation(message.text, message.at, nextId), ...state.conversations], activeId: nextId }
  const last = active.messages[active.messages.length - 1]
  if (last && sameMessage(last, message)) return state
  const updated = appendMessage(active, message)
  return { ...state, conversations: state.conversations.map((conversation) => conversation.id === active.id ? updated : conversation) }
}

/** A resposta é anexada à conversa que iniciou o turno, não à que estiver selecionada quando ela chegar. */
export function recordTurnInConversation(state: ConversationState, message: ConversationMessage, conversationId: string): ConversationState {
  const target = state.conversations.find((conversation) => conversation.id === conversationId)
  if (!target) return state
  const last = target.messages[target.messages.length - 1]
  if (last && sameMessage(last, message)) return state
  return { ...state, conversations: state.conversations.map((conversation) => conversation.id === conversationId ? appendMessage(conversation, message) : conversation) }
}

/** Só uma transição terminal vira mensagem: `idle`, `streaming` e `failure` não entram no histórico. */
export function assistantMessageFor(state: AssistantTurnState, at: string): ConversationMessage | undefined {
  if (state.status === 'replied' || state.status === 'confirmation') {
    const provenance = provenanceLabel(state.provenance)
    return { role: 'assistant', text: state.text, at, ...(provenance ? { provenance } : {}) }
  }
  if (state.status === 'executed') return { role: 'assistant', text: state.summary, at }
  if (state.status === 'cancelled') return { role: 'assistant', text: state.text, at }
  return undefined
}

const noopStorage: Pick<Storage, 'getItem' | 'setItem'> = { getItem: () => null, setItem: () => undefined }
// Mesmo motivo de `src/i18n/locale-storage.ts`: uma política restritiva pode fazer o acesso lançar.
const browserStorage = (): Pick<Storage, 'getItem' | 'setItem'> => {
  try { return window.localStorage } catch { return noopStorage }
}
const conversationId = () => `conversation-${crypto.randomUUID()}`

// O dono único da conversa, montado uma vez no App: a paleta pergunta com a tela Taby desmontada,
// então a thread não pode viver dentro da tela. Aqui também mora a única escrita das respostas —
// a transição terminal do turno vira mensagem uma vez só, guardada por `handled`.
export function useConversations({ storage, turn, onEvent }: ConversationsHost = {}): ConversationsController {
  const [host] = useState<Pick<Storage, 'getItem' | 'setItem'>>(() => storage ?? browserStorage())
  const [state, setState] = useState<ConversationState>(() => ({ conversations: loadConversations(host), activeId: null }))
  const [query, setQuery] = useState('')
  const [saveFailed, setSaveFailed] = useState(false)
  const stateRef = useRef(state)
  stateRef.current = state
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent
  // `log` do App é recriado a cada render; sem a ref o efeito abaixo rodaria em todo render.
  const warned = useRef('')
  const handled = useRef('')
  const conversationForRequest = useRef(new Map<string, string | null>())

  const apply = useCallback((next: ConversationState) => {
    if (next === stateRef.current) return
    stateRef.current = next
    setState(next)
    const saved = saveConversations(host, next.conversations)
    setSaveFailed(!saved)
    // Avisa uma vez por conversa: perder a gravação não pode virar um alarme a cada mensagem.
    const key = next.activeId ?? 'none'
    if (saved) warned.current = ''
    else if (warned.current !== key) { warned.current = key; onEventRef.current?.('taby', 'conversation', 'fail') }
  }, [host])

  const record = useCallback((message: ConversationMessage) => apply(recordTurn(stateRef.current, message, conversationId())), [apply])
  const select = useCallback((id: string) => setState((current) => { const next = { ...current, activeId: id }; stateRef.current = next; return next }), [])
  // Uma conversa nova só existe quando a primeira pergunta chega: `activeId` nulo faz `recordTurn` criá-la.
  const create = useCallback(() => setState((current) => { const next = { ...current, activeId: null }; stateRef.current = next; return next }), [])
  const remove = useCallback((id: string) => {
    const current = stateRef.current
    apply({ conversations: current.conversations.filter((conversation) => conversation.id !== id), activeId: current.activeId === id ? null : current.activeId })
  }, [apply])
  const removeAll = useCallback(() => apply({ conversations: [], activeId: null }), [apply])

  const turnState = turn?.state
  useEffect(() => {
    if (!turnState || turnState.status === 'idle') return
    if (turnState.status === 'streaming') conversationForRequest.current.set(turnState.requestId, stateRef.current.activeId)
    const key = `${turnState.status}:${turnState.requestId}`
    if (handled.current === key) return
    const message = assistantMessageFor(turnState, new Date().toISOString())
    if (!message) return
    handled.current = key
    const target = conversationForRequest.current.get(turnState.requestId)
    if (target) apply(recordTurnInConversation(stateRef.current, message, target))
    else record(message)
    if (turnState.status === 'replied' || turnState.status === 'executed' || turnState.status === 'cancelled') conversationForRequest.current.delete(turnState.requestId)
  }, [turnState, record, apply])

  return useMemo<ConversationsController>(() => ({
    conversations: state.conversations,
    activeId: state.activeId,
    query,
    saveFailed,
    record,
    select,
    create,
    remove,
    removeAll,
    search: setQuery,
  }), [state, query, saveFailed, record, select, create, remove, removeAll])
}

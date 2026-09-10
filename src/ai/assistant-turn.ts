import type { AiProviderFailure } from './contracts'
import type { Confirmation } from './policy'

export type AssistantProvenance = Readonly<{ provider?: string; model?: string; totalTokens?: number; fallback?: boolean }>

export type AssistantTurnState =
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'streaming'; requestId: string; text: string; provenance: AssistantProvenance; cancelRequested: boolean }>
  | Readonly<{ status: 'replied'; requestId: string; text: string; provenance: AssistantProvenance }>
  | Readonly<{ status: 'confirmation'; requestId: string; confirmation: Confirmation; text: string; provenance: AssistantProvenance }>
  | Readonly<{ status: 'failure'; requestId: string; message: string; failure: AiProviderFailure }>
  | Readonly<{ status: 'executed'; requestId: string; summary: string; partialFailure: boolean }>
  | Readonly<{ status: 'cancelled'; requestId: string; text: string }>

export type AssistantTurnAction =
  | Readonly<{ type: 'reset' }>
  | Readonly<{ type: 'turn.started'; requestId: string }>
  | Readonly<{ type: 'stream.started'; requestId: string; provider?: string; model?: string }>
  | Readonly<{ type: 'stream.delta'; requestId: string; delta: string }>
  | Readonly<{ type: 'stream.usage'; requestId: string; totalTokens: number }>
  | Readonly<{ type: 'cancel.requested'; requestId: string }>
  | Readonly<{ type: 'turn.replied'; requestId: string; text: string; provenance: AssistantProvenance }>
  | Readonly<{ type: 'turn.confirmation'; requestId: string; confirmation: Confirmation; text: string; provenance: AssistantProvenance }>
  | Readonly<{ type: 'turn.failed'; requestId: string; message: string; failure: AiProviderFailure }>
  | Readonly<{ type: 'turn.cancelled'; requestId: string; text: string }>
  | Readonly<{ type: 'confirmation.executed'; requestId: string; summary: string; partialFailure: boolean }>
  | Readonly<{ type: 'confirmation.cancelled'; requestId: string; text: string }>

export type DismissIntent = 'close' | 'stop-stream' | 'cancel-confirmation'

export const initialAssistantTurnState: AssistantTurnState = { status: 'idle' }

// Transições fora de ordem (stream de um pedido antigo, resposta depois de confirmação) são ignoradas:
// devolver o mesmo estado é o que impede a paleta e a página de divergirem.
export function assistantTurnReducer(state: AssistantTurnState, action: AssistantTurnAction): AssistantTurnState {
  const streaming = state.status === 'streaming' && 'requestId' in action && state.requestId === action.requestId
  const confirming = state.status === 'confirmation' && 'requestId' in action && state.requestId === action.requestId
  switch (action.type) {
    case 'reset': return initialAssistantTurnState
    case 'turn.started': return { status: 'streaming', requestId: action.requestId, text: '', provenance: {}, cancelRequested: false }
    case 'stream.started': return streaming && state.status === 'streaming' ? { ...state, provenance: { ...state.provenance, ...(action.provider === undefined ? {} : { provider: action.provider }), ...(action.model === undefined ? {} : { model: action.model }) } } : state
    case 'stream.delta': return streaming && state.status === 'streaming' ? { ...state, text: `${state.text}${action.delta}` } : state
    case 'stream.usage': return streaming && state.status === 'streaming' ? { ...state, provenance: { ...state.provenance, totalTokens: action.totalTokens } } : state
    case 'cancel.requested': return streaming && state.status === 'streaming' ? { ...state, cancelRequested: true } : state
    case 'turn.replied': return streaming ? { status: 'replied', requestId: action.requestId, text: action.text, provenance: action.provenance } : state
    case 'turn.confirmation': return streaming ? { status: 'confirmation', requestId: action.requestId, confirmation: action.confirmation, text: action.text, provenance: action.provenance } : state
    case 'turn.failed': return streaming ? { status: 'failure', requestId: action.requestId, message: action.message, failure: action.failure } : state
    case 'turn.cancelled': return streaming ? { status: 'cancelled', requestId: action.requestId, text: action.text } : state
    case 'confirmation.executed': return confirming ? { status: 'executed', requestId: action.requestId, summary: action.summary, partialFailure: action.partialFailure } : state
    case 'confirmation.cancelled': return confirming ? { status: 'cancelled', requestId: action.requestId, text: action.text } : state
  }
}

export function dismissIntent(state: AssistantTurnState): DismissIntent {
  if (state.status === 'confirmation') return 'cancel-confirmation'
  if (state.status === 'streaming') return 'stop-stream'
  return 'close'
}

export const provenanceLabel = (provenance: AssistantProvenance): string => [provenance.provider, provenance.model, provenance.totalTokens === undefined ? undefined : `${provenance.totalTokens} tokens`, provenance.fallback ? 'local fallback' : undefined].filter((value): value is string => Boolean(value)).join(' · ')

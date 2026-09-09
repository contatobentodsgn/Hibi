export type AiSurface = 'desktop' | 'notch'

export type AiTurnStage =
  | 'received'
  | 'interpreting'
  | 'gathering_context'
  | 'generating'
  | 'validating'
  | 'awaiting_confirmation'
  | 'executing'
  | 'completed'
  | 'failed'

export interface AiToolCall {
  name: string
  arguments: Record<string, unknown>
}

export interface AiToolSchema {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface AiContextEvidence {
  sourceId: string
  label: string
  content: string
}

export interface AiConversationEntry {
  role: 'user' | 'assistant'
  content: string
}

export interface AiProviderRequest {
  message: string
  locale: string
  currentTime: string
  surface: AiSurface
  allowedTools: readonly AiToolSchema[]
  contextEvidence: readonly AiContextEvidence[]
  recentTranscript: readonly AiConversationEntry[]
  /**
   * Renderer-only progress channel. Implementations must never serialize this
   * callback across a process boundary.
   */
  onStreamEvent?: (event: AiProviderStreamEvent) => void
}

export interface AiNotchPresentation {
  kind: 'reply' | 'question' | 'status'
  title: string
  body: string
}

export interface AiStructuredUiBlock {
  kind: string
  data: Record<string, unknown>
}

export interface AiProviderMetadata {
  requestId?: string
  providerId?: string
  provider?: string
  model?: string
  finishReason?: string
  usage?: AiNormalizedUsage
}

export interface AiNormalizedUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCost?: number
}

export type AiProviderFailureCode =
  | 'invalid_credentials'
  | 'rate_limited'
  | 'unavailable'
  | 'invalid_response'
  | 'cancelled'

export interface AiProviderFailure {
  code: AiProviderFailureCode
  retryable: boolean
  retryAfterMs?: number
}

export type AiFallbackPolicy = 'ask' | 'automatic' | 'never'

export type AiModelPresetId = 'fast' | 'balanced' | 'reasoning' | 'custom'

export interface AiModelPreset {
  id: AiModelPresetId
  label: string
  description: string
}

export interface AiProviderStreamStartedEvent {
  type: 'started'
  requestId?: string
  provider?: string
  model?: string
}

export interface AiProviderStreamDeltaEvent {
  type: 'delta'
  delta: string
}

export interface AiProviderStreamUsageEvent {
  type: 'usage'
  usage: AiNormalizedUsage
}

export interface AiProviderStreamCompletedEvent {
  type: 'completed'
}

export interface AiProviderStreamRetryingEvent {
  type: 'retrying'
  attempt: number
  delayMs: number
  failure: AiProviderFailure
}

export interface AiProviderStreamFailedEvent {
  type: 'failed'
  failure: AiProviderFailure
}

export type AiProviderStreamEvent =
  | AiProviderStreamStartedEvent
  | AiProviderStreamDeltaEvent
  | AiProviderStreamUsageEvent
  | AiProviderStreamCompletedEvent
  | AiProviderStreamRetryingEvent
  | AiProviderStreamFailedEvent

export type AiStreamEvent = AiProviderStreamEvent
export type AiProviderUsage = AiNormalizedUsage
export type AiSafeProviderFailure = AiProviderFailure

export interface AiProviderProposal {
  reply: string
  toolCalls: AiToolCall[]
  notchPresentation: AiNotchPresentation | null
  uiBlocks?: AiStructuredUiBlock[]
  providerMetadata?: AiProviderMetadata
}

export interface AiProvider {
  id: string
  label: string
  generate(
    request: AiProviderRequest,
    signal: AbortSignal,
  ): Promise<AiProviderProposal>
}

export interface AiPolicyDecision {
  allowed: boolean
  reason?: string
}

export interface AiTurnResult {
  stage: AiTurnStage
  proposal?: AiProviderProposal
  error?: string
}

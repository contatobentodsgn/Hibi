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
  model?: string
  finishReason?: string
}

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

import type { AiNormalizedUsage, AiProvider, AiProviderFailure, AiProviderProposal, AiProviderRequest, AiProviderStreamEvent } from './contracts'
import { parseProviderProposal } from './provider-parser'

type AiConfigStatus = {
  provider: 'local' | 'openai-compatible'
  endpoint: string
  model: string
  hasApiKey: boolean
}

type DesktopBridge = {
  getAiConfig?: () => Promise<AiConfigStatus>
  runAiTurn?: (turn: { request: AiProviderRequest; correlationId: string }) => Promise<{ content: string; providerLabel: string; model: string; requestId?: string; correlationId?: string; usage?: AiNormalizedUsage }>
  cancelAiTurn?: (request: { correlationId: string; requestId?: string }) => Promise<boolean>
  onAiStreamEvent?: (callback: (event: AiProviderStreamEvent & { requestId: string; correlationId: string }) => void) => () => void
}

const MAX_MODEL_LENGTH = 240

function streamFailureError(failure: AiProviderFailure): Error {
  return Object.assign(new Error(`AI provider request failed: ${failure.code}.`), { failure })
}

export function createCorrelationId(): string {
  const crypto = globalThis.crypto
  const uuid = crypto?.randomUUID?.()
  if (typeof uuid === 'string' && uuid.length > 0) return `renderer-${uuid.replace(/[^A-Za-z0-9_-]/g, '')}`
  if (!crypto?.getRandomValues) throw new Error('Secure AI correlation ID generation is unavailable.')
  const bytes = new Uint32Array(4)
  crypto.getRandomValues(bytes)
  return `renderer-${Array.from(bytes, (value) => value.toString(36)).join('')}`.slice(0, 128)
}

export class ElectronConfiguredProvider implements AiProvider {
  readonly id = 'electron-configured'
  readonly label = 'Configured AI'

  constructor(private readonly bridge: DesktopBridge = window.pixanoDesktop ?? {}, private readonly local?: AiProvider) {}

  async generate(request: AiProviderRequest, signal: AbortSignal): Promise<AiProviderProposal> {
    const { onStreamEvent, ...bridgeRequest } = request
    const correlationId = createCorrelationId()
    let streamRequestId: string | undefined
    let streamContent = ''
    let streamModel: string | undefined
    let streamProvider: string | undefined
    let streamUsage: AiNormalizedUsage | undefined
    let streamCompleted = false
    let streamFailure: AiProviderFailure | undefined
    const unsubscribe = this.bridge.onAiStreamEvent?.((event) => {
      if (event.correlationId !== correlationId) return
      if (event.type === 'started') {
        if (streamRequestId) return
        streamRequestId = event.requestId
        streamModel = event.model
        streamProvider = event.provider
        onStreamEvent?.({ type: 'started', requestId: event.requestId, ...(event.provider === undefined ? {} : { provider: event.provider }), ...(event.model === undefined ? {} : { model: event.model }) })
        return
      }
      if (!streamRequestId || event.requestId !== streamRequestId) return
      if (event.type === 'delta') { streamContent += event.delta; onStreamEvent?.({ type: 'delta', delta: event.delta }) }
      if (event.type === 'usage') { streamUsage = event.usage; onStreamEvent?.({ type: 'usage', usage: event.usage }) }
      if (event.type === 'completed') { streamCompleted = true; onStreamEvent?.({ type: 'completed' }) }
      if (event.type === 'failed') { streamFailure = event.failure; onStreamEvent?.({ type: 'failed', failure: event.failure }) }
    })
    const abortMain = () => {
      void this.bridge.cancelAiTurn?.({ correlationId, ...(streamRequestId === undefined ? {} : { requestId: streamRequestId }) })
    }
    if (signal.aborted) {
      unsubscribe?.()
      throw new DOMException('The AI turn was cancelled.', 'AbortError')
    }
    signal.addEventListener('abort', abortMain, { once: true })
    try {
      const config = await this.bridge.getAiConfig?.()
      if (signal.aborted) throw new DOMException('The AI turn was cancelled.', 'AbortError')
      if (config?.provider !== 'openai-compatible' || !config.hasApiKey || !this.bridge.runAiTurn) {
        if (!this.local) throw new Error('A local AI provider is required when no configured provider is available.')
        const proposal = await this.local.generate(request, signal)
        return {
          ...proposal,
          providerMetadata: {
            ...proposal.providerMetadata,
            providerId: proposal.providerMetadata?.providerId ?? this.local.id,
            provider: proposal.providerMetadata?.provider ?? this.local.label,
          },
        }
      }
      const result = await this.bridge.runAiTurn({ request: bridgeRequest, correlationId })
      if (signal.aborted) throw new DOMException('The AI turn was cancelled.', 'AbortError')
      if (this.bridge.onAiStreamEvent && (!streamRequestId || !result.requestId || result.requestId !== streamRequestId || result.correlationId !== correlationId)) throw new Error('AI bridge returned an unscoped request result.')
      if (streamFailure) throw streamFailureError(streamFailure)
      const useStream = streamCompleted
        && streamContent.length > 0
        && result.requestId === streamRequestId
      const proposal = parseProviderProposal(useStream ? streamContent : result.content, new Set(request.allowedTools.map((tool) => tool.name)))
      const model = typeof streamModel === 'string' && streamModel.length <= MAX_MODEL_LENGTH
        ? streamModel
        : typeof result.model === 'string' && result.model.length <= MAX_MODEL_LENGTH
          ? result.model
          : config.model
      const provider = typeof streamProvider === 'string' && streamProvider.length <= MAX_MODEL_LENGTH
        ? streamProvider
        : result.providerLabel
      return {
        ...proposal,
        providerMetadata: {
          ...proposal.providerMetadata,
          requestId: streamRequestId ?? result.requestId ?? proposal.providerMetadata?.requestId,
          provider,
          model,
          usage: streamUsage ?? result.usage ?? proposal.providerMetadata?.usage,
        },
      }
    } finally {
      unsubscribe?.()
      signal.removeEventListener('abort', abortMain)
    }
  }
}

import type { AiProvider, AiProviderProposal, AiProviderRequest } from './contracts'
import { parseProviderProposal } from './provider-parser'

type AiConfigStatus = {
  provider: 'local' | 'openai-compatible'
  endpoint: string
  model: string
  hasApiKey: boolean
}

type DesktopBridge = {
  getAiConfig?: () => Promise<AiConfigStatus>
  runAiTurn?: (turn: { request: AiProviderRequest }) => Promise<{ content: string; providerLabel: string; model: string }>
  cancelAiTurn?: () => Promise<boolean>
}

const MAX_MODEL_LENGTH = 240

export class ElectronConfiguredProvider implements AiProvider {
  readonly id = 'electron-configured'
  readonly label = 'Configured AI'

  constructor(private readonly bridge: DesktopBridge = window.hibiDesktop ?? {}, private readonly local?: AiProvider) {}

  async generate(request: AiProviderRequest, signal: AbortSignal): Promise<AiProviderProposal> {
    const abortMain = () => { void this.bridge.cancelAiTurn?.() }
    if (signal.aborted) {
      abortMain()
      throw new DOMException('The AI turn was cancelled.', 'AbortError')
    }
    const config = await this.bridge.getAiConfig?.()
    if (config?.provider !== 'openai-compatible' || !config.hasApiKey || !this.bridge.runAiTurn) {
      if (!this.local) throw new Error('A local AI provider is required when no configured provider is available.')
      return this.local.generate(request, signal)
    }
    signal.addEventListener('abort', abortMain, { once: true })
    try {
      const result = await this.bridge.runAiTurn({ request })
      if (signal.aborted) throw new DOMException('The AI turn was cancelled.', 'AbortError')
      const proposal = parseProviderProposal(result.content, new Set(request.allowedTools.map((tool) => tool.name)))
      const model = typeof result.model === 'string' && result.model.length <= MAX_MODEL_LENGTH ? result.model : config.model
      return { ...proposal, providerMetadata: { ...proposal.providerMetadata, model } }
    } finally {
      signal.removeEventListener('abort', abortMain)
    }
  }
}

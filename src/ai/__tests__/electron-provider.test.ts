import { describe, expect, it, vi } from 'vitest'
import { ElectronConfiguredProvider } from '../electron-provider'
import type { AiProviderRequest } from '../contracts'

const request: AiProviderRequest = {
  message: 'Create a task called Review brief',
  locale: 'en-US',
  currentTime: '2026-09-07T12:00:00.000Z',
  surface: 'desktop',
  allowedTools: [{ name: 'task.create', description: 'Create a task', inputSchema: { type: 'object' } }],
  contextEvidence: [],
  recentTranscript: [],
}

describe('ElectronConfiguredProvider', () => {
  it('forwards a bounded provider request to the desktop bridge and parses it against real tool schemas', async () => {
    const run = vi.fn().mockResolvedValue({
      content: JSON.stringify({ reply: 'Ready for confirmation.', toolCalls: [{ name: 'task.create', arguments: { title: 'Review brief' } }], notchPresentation: null }),
      providerLabel: 'OpenAI-compatible',
      model: 'gpt-test',
    })
    const provider = new ElectronConfiguredProvider({ runAiTurn: run, getAiConfig: vi.fn().mockResolvedValue({ provider: 'openai-compatible', endpoint: 'https://api.example.test/v1/chat/completions', model: 'gpt-test', hasApiKey: true }) })

    const proposal = await provider.generate(request, new AbortController().signal)

    expect(run).toHaveBeenCalledWith({ request })
    expect(proposal.toolCalls).toEqual([{ name: 'task.create', arguments: { title: 'Review brief' } }])
    expect(proposal.providerMetadata?.model).toBe('gpt-test')
  })

  it('rejects an external proposal attempting a tool that is not in the real registry', async () => {
    const provider = new ElectronConfiguredProvider({
      runAiTurn: vi.fn().mockResolvedValue({ content: JSON.stringify({ reply: 'Nope', toolCalls: [{ name: 'shell.execute', arguments: {} }], notchPresentation: null }), providerLabel: 'OpenAI-compatible', model: 'gpt-test' }),
      getAiConfig: vi.fn().mockResolvedValue({ provider: 'openai-compatible', endpoint: 'https://api.example.test/v1/chat/completions', model: 'gpt-test', hasApiKey: true }),
    })

    await expect(provider.generate(request, new AbortController().signal)).rejects.toThrow('Tool call name is not allowed')
  })

  it('uses the local provider when no external provider with a stored key is configured', async () => {
    const local = { id: 'local', label: 'Local', generate: vi.fn().mockResolvedValue({ reply: 'Local response', toolCalls: [], notchPresentation: null }) }
    const provider = new ElectronConfiguredProvider({ runAiTurn: vi.fn(), getAiConfig: vi.fn().mockResolvedValue({ provider: 'local', endpoint: '', model: 'local-tool-provider', hasApiKey: false }) }, local)

    await expect(provider.generate(request, new AbortController().signal)).resolves.toMatchObject({ reply: 'Local response' })
  })

  it('cancels the in-flight main-process provider request when the assistant turn is aborted', async () => {
    const cancelAiTurn = vi.fn().mockResolvedValue(true)
    const provider = new ElectronConfiguredProvider({
      runAiTurn: vi.fn().mockResolvedValue({ content: JSON.stringify({ reply: 'Ignored', toolCalls: [], notchPresentation: null }), providerLabel: 'OpenAI-compatible', model: 'gpt-test' }),
      cancelAiTurn,
      getAiConfig: vi.fn().mockResolvedValue({ provider: 'openai-compatible', endpoint: 'https://api.example.test/v1/chat/completions', model: 'gpt-test', hasApiKey: true }),
    })
    const controller = new AbortController()
    controller.abort()

    await expect(provider.generate(request, controller.signal)).rejects.toThrow('cancelled')
    expect(cancelAiTurn).toHaveBeenCalledOnce()
  })
})

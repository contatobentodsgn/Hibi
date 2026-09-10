import { describe, expect, it, vi } from 'vitest'
import { createCorrelationId, ElectronConfiguredProvider } from '../electron-provider'
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
  it('refuses to create a request correlation without cryptographically secure randomness', () => {
    const originalCrypto = globalThis.crypto
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined })

    try {
      expect(() => createCorrelationId()).toThrow('Secure AI correlation ID generation is unavailable.')
    } finally {
      Object.defineProperty(globalThis, 'crypto', { configurable: true, value: originalCrypto })
    }
  })

  it('forwards a bounded provider request to the desktop bridge and parses it against real tool schemas', async () => {
    const run = vi.fn().mockResolvedValue({
      content: JSON.stringify({ reply: 'Ready for confirmation.', toolCalls: [{ name: 'task.create', arguments: { title: 'Review brief' } }], notchPresentation: null }),
      providerLabel: 'OpenAI-compatible',
      model: 'gpt-test',
      requestId: 'direct-turn',
      usage: { inputTokens: 12, outputTokens: 5, totalTokens: 19 },
    })
    const provider = new ElectronConfiguredProvider({ runAiTurn: run, getAiConfig: vi.fn().mockResolvedValue({ provider: 'openai-compatible', endpoint: 'https://api.example.test/v1/chat/completions', model: 'gpt-test', hasApiKey: true }) })

    const proposal = await provider.generate(request, new AbortController().signal)

    expect(run).toHaveBeenCalledWith({ request, correlationId: expect.stringMatching(/^renderer-[A-Za-z0-9_-]{1,119}$/) })
    expect(proposal.toolCalls).toEqual([{ name: 'task.create', arguments: { title: 'Review brief' } }])
    expect(proposal.providerMetadata?.model).toBe('gpt-test')
    expect(proposal.providerMetadata).toMatchObject({ requestId: 'direct-turn', usage: { inputTokens: 12, outputTokens: 5, totalTokens: 19 } })
  })

  it('rejects an external proposal attempting a tool that is not in the real registry', async () => {
    const provider = new ElectronConfiguredProvider({
      runAiTurn: vi.fn().mockResolvedValue({ content: JSON.stringify({ reply: 'Nope', toolCalls: [{ name: 'shell.execute', arguments: {} }], notchPresentation: null }), providerLabel: 'OpenAI-compatible', model: 'gpt-test' }),
      getAiConfig: vi.fn().mockResolvedValue({ provider: 'openai-compatible', endpoint: 'https://api.example.test/v1/chat/completions', model: 'gpt-test', hasApiKey: true }),
    })

    await expect(provider.generate(request, new AbortController().signal)).rejects.toThrow('Tool call name is not allowed')
  })

  it('assembles only its request-id stream into a parsed proposal with reported usage', async () => {
    let streamListener: ((event: unknown) => void) | undefined
    const unsubscribe = vi.fn()
    const liveEvents: unknown[] = []
    const content = JSON.stringify({ reply: 'Ready for confirmation.', toolCalls: [{ name: 'task.create', arguments: { title: 'Review brief' } }], notchPresentation: null })
    const provider = new ElectronConfiguredProvider({
      onAiStreamEvent: (listener: (event: unknown) => void) => { streamListener = listener; return unsubscribe },
      runAiTurn: vi.fn().mockImplementation(async ({ correlationId }: { correlationId: string }) => {
        streamListener?.({ type: 'started', correlationId, requestId: 'turn-7', provider: 'OpenAI-compatible', model: 'reported-model' })
        streamListener?.({ type: 'delta', correlationId: 'other-correlation', requestId: 'other-turn', delta: '{"reply":"untrusted"}' })
        streamListener?.({ type: 'delta', correlationId, requestId: 'turn-7', delta: content.slice(0, 37) })
        streamListener?.({ type: 'usage', correlationId, requestId: 'turn-7', usage: { inputTokens: 12, outputTokens: 5, totalTokens: 17 } })
        streamListener?.({ type: 'delta', correlationId, requestId: 'turn-7', delta: content.slice(37) })
        streamListener?.({ type: 'completed', correlationId, requestId: 'turn-7' })
        return { correlationId, requestId: 'turn-7', content: '{"reply":"must not bypass the stream"}', providerLabel: 'OpenAI-compatible', model: 'fallback-model' }
      }),
      getAiConfig: vi.fn().mockResolvedValue({ provider: 'openai-compatible', endpoint: 'https://api.example.test/v1/chat/completions', model: 'configured-model', hasApiKey: true }),
    } as any)

    const proposal = await provider.generate({ ...request, onStreamEvent: (event) => liveEvents.push(event) }, new AbortController().signal)

    expect(proposal).toMatchObject({
      reply: 'Ready for confirmation.',
      providerMetadata: {
        requestId: 'turn-7',
        model: 'reported-model',
        usage: { inputTokens: 12, outputTokens: 5, totalTokens: 17 },
      },
    })
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(liveEvents).toEqual([
      { type: 'started', requestId: 'turn-7', provider: 'OpenAI-compatible', model: 'reported-model' },
      { type: 'delta', delta: content.slice(0, 37) },
      { type: 'usage', usage: { inputTokens: 12, outputTokens: 5, totalTokens: 17 } },
      { type: 'delta', delta: content.slice(37) },
      { type: 'completed' },
    ])
  })

  it('still rejects an invalid structured proposal assembled from the subscribed stream', async () => {
    let streamListener: ((event: unknown) => void) | undefined
    const provider = new ElectronConfiguredProvider({
      onAiStreamEvent: (listener: (event: unknown) => void) => { streamListener = listener; return () => {} },
      runAiTurn: vi.fn().mockImplementation(async ({ correlationId }: { correlationId: string }) => {
        streamListener?.({ type: 'started', correlationId, requestId: 'turn-8' })
        streamListener?.({ type: 'delta', correlationId, requestId: 'turn-8', delta: JSON.stringify({ reply: 'Nope', toolCalls: [{ name: 'shell.execute', arguments: {} }], notchPresentation: null }) })
        streamListener?.({ type: 'completed', correlationId, requestId: 'turn-8' })
        return { correlationId, requestId: 'turn-8', content: JSON.stringify({ reply: 'Trusted only if unparsed', toolCalls: [], notchPresentation: null }), providerLabel: 'OpenAI-compatible', model: 'gpt-test' }
      }),
      getAiConfig: vi.fn().mockResolvedValue({ provider: 'openai-compatible', endpoint: 'https://api.example.test/v1/chat/completions', model: 'gpt-test', hasApiKey: true }),
    } as any)

    await expect(provider.generate(request, new AbortController().signal)).rejects.toThrow('Tool call name is not allowed')
  })

  it('ignores a stale queued started event and binds only the matching renderer correlation', async () => {
    let streamListener: ((event: unknown) => void) | undefined
    const content = JSON.stringify({ reply: 'Streamed through the matching correlation.', toolCalls: [], notchPresentation: null })
    const runAiTurn = vi.fn().mockImplementation(async ({ correlationId }: { correlationId: string }) => {
      streamListener?.({ type: 'started', correlationId: 'stale-correlation', requestId: 'stale-turn', provider: 'OpenAI-compatible', model: 'stale-model' })
      streamListener?.({ type: 'started', correlationId, requestId: 'turn-9', provider: 'OpenAI-compatible', model: 'gpt-test' })
      streamListener?.({ type: 'delta', correlationId, requestId: 'turn-9', delta: content.slice(0, 24) })
      streamListener?.({ type: 'delta', correlationId: 'stale-correlation', requestId: 'stale-turn', delta: '{"reply":"untrusted"}' })
      streamListener?.({ type: 'delta', correlationId, requestId: 'turn-9', delta: content.slice(24) })
      streamListener?.({ type: 'completed', correlationId, requestId: 'turn-9' })
      return { correlationId, requestId: 'turn-9', content: '{"reply":"must not bypass the stream"}', providerLabel: 'OpenAI-compatible', model: 'gpt-test' }
    })
    const provider = new ElectronConfiguredProvider({
      onAiStreamEvent: (listener: (event: unknown) => void) => { streamListener = listener; return () => {} },
      runAiTurn,
      getAiConfig: vi.fn().mockResolvedValue({ provider: 'openai-compatible', endpoint: 'https://api.example.test/v1/chat/completions', model: 'gpt-test', hasApiKey: true }),
    } as any)

    await expect(provider.generate(request, new AbortController().signal)).resolves.toMatchObject({ reply: 'Streamed through the matching correlation.', providerMetadata: { requestId: 'turn-9' } })
    expect(runAiTurn).toHaveBeenCalledWith({ request, correlationId: expect.stringMatching(/^renderer-[A-Za-z0-9_-]{1,119}$/) })
  })

  it('cancels the known request while configuration is still pending and never starts the remote run', async () => {
    let releaseConfig!: (value: { provider: 'openai-compatible'; endpoint: string; model: string; hasApiKey: boolean }) => void
    let streamListener: ((event: unknown) => void) | undefined
    const runAiTurn = vi.fn()
    const cancelAiTurn = vi.fn().mockResolvedValue(true)
    const provider = new ElectronConfiguredProvider({
      onAiStreamEvent: (listener: (event: unknown) => void) => { streamListener = listener; return () => {} },
      getAiConfig: () => new Promise((resolve) => { releaseConfig = resolve }),
      runAiTurn,
      cancelAiTurn,
    } as any)
    const controller = new AbortController()

    const pending = provider.generate(request, controller.signal)
    controller.abort()
    releaseConfig({ provider: 'openai-compatible', endpoint: 'https://api.example.test/v1/chat/completions', model: 'gpt-test', hasApiKey: true })

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(runAiTurn).not.toHaveBeenCalled()
    expect(cancelAiTurn).toHaveBeenCalledWith({ correlationId: expect.stringMatching(/^renderer-[A-Za-z0-9_-]{1,119}$/) })
  })

  it('uses the local provider when no external provider with a stored key is configured', async () => {
    const local = { id: 'local', label: 'Local', generate: vi.fn().mockResolvedValue({ reply: 'Local response', toolCalls: [], notchPresentation: null }) }
    const provider = new ElectronConfiguredProvider({ runAiTurn: vi.fn(), getAiConfig: vi.fn().mockResolvedValue({ provider: 'local', endpoint: '', model: 'local-tool-provider', hasApiKey: false }) }, local)

    await expect(provider.generate(request, new AbortController().signal)).resolves.toMatchObject({ reply: 'Local response', providerMetadata: { providerId: 'local', provider: 'Local' } })
  })

  it('cancels the exact started main-process request when the assistant turn is aborted', async () => {
    const cancelAiTurn = vi.fn().mockResolvedValue(true)
    let streamListener: ((event: unknown) => void) | undefined
    let complete!: (value: { content: string; providerLabel: string; model: string; requestId: string }) => void
    const provider = new ElectronConfiguredProvider({
      onAiStreamEvent: (listener: (event: unknown) => void) => { streamListener = listener; return () => {} },
      runAiTurn: vi.fn().mockImplementation(({ correlationId }: { correlationId: string }) => {
        streamListener?.({ type: 'started', correlationId, requestId: 'turn-cancel' })
        return new Promise((resolve) => { complete = resolve })
      }),
      cancelAiTurn,
      getAiConfig: vi.fn().mockResolvedValue({ provider: 'openai-compatible', endpoint: 'https://api.example.test/v1/chat/completions', model: 'gpt-test', hasApiKey: true }),
    } as any)
    const controller = new AbortController()
    const pending = provider.generate(request, controller.signal)
    await Promise.resolve()
    controller.abort()
    complete({ content: JSON.stringify({ reply: 'Ignored', toolCalls: [], notchPresentation: null }), providerLabel: 'OpenAI-compatible', model: 'gpt-test', requestId: 'turn-cancel' })

    await expect(pending).rejects.toThrow('cancelled')
    expect(cancelAiTurn).toHaveBeenCalledWith({ correlationId: expect.stringMatching(/^renderer-[A-Za-z0-9_-]{1,119}$/), requestId: 'turn-cancel' })
  })
})

import { describe, expect, expectTypeOf, it } from 'vitest'

import type {
  AiProviderProposal,
  AiProviderRequest,
  AiTurnStage,
} from '../contracts'
import { parseProviderProposal } from '../provider-parser'

const allowedTools = new Set(['create_note', 'open_note'])
const maxProviderResponseBytes = 64 * 1024

const requestContract: AiProviderRequest = {
  message: 'What should I study next?',
  locale: 'en-US',
  currentTime: '2026-09-06T12:00:00.000Z',
  surface: 'desktop',
  allowedTools: [
    {
      name: 'open_note',
      description: 'Open a note',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
  contextEvidence: [
    { sourceId: 'note-1', label: 'Physics note', content: 'Review chapter 4' },
  ],
  recentTranscript: [
    { role: 'user', content: 'Help me plan.' },
    { role: 'assistant', content: 'What subject?' },
  ],
}

const pipelineStages: Record<AiTurnStage, true> = {
  received: true,
  interpreting: true,
  gathering_context: true,
  generating: true,
  validating: true,
  awaiting_confirmation: true,
  executing: true,
  completed: true,
  failed: true,
}

function nestedObject(depth: number): Record<string, unknown> {
  let value: Record<string, unknown> = { value: 'leaf' }
  for (let index = 0; index < depth; index += 1) value = { child: value }
  return value
}

describe('parseProviderProposal', () => {
  it('parses a valid proposal and ignores unknown top-level fields', () => {
    expect(
      parseProviderProposal(
        JSON.stringify({
          reply: 'I can create that note.',
          toolCalls: [
            {
              name: 'create_note',
              arguments: { title: 'Physics', pinned: true },
            },
          ],
          notchPresentation: {
            kind: 'status',
            title: 'Creating note',
            body: 'Adding Physics to your notes.',
          },
          uiBlocks: [
            { kind: 'note', data: { title: 'Physics', pinned: true } },
          ],
          providerMetadata: {
            requestId: 'req-1',
            model: 'local-test',
            finishReason: 'stop',
            credential: 'must-not-survive',
            prompt: 'must-not-survive',
          },
          unknownTopLevel: 'ignored',
        }),
        allowedTools,
      ),
    ).toEqual({
      reply: 'I can create that note.',
      toolCalls: [
        {
          name: 'create_note',
          arguments: { title: 'Physics', pinned: true },
        },
      ],
      notchPresentation: {
        kind: 'status',
        title: 'Creating note',
        body: 'Adding Physics to your notes.',
      },
      uiBlocks: [
        { kind: 'note', data: { title: 'Physics', pinned: true } },
      ],
      providerMetadata: {
        requestId: 'req-1',
        model: 'local-test',
        finishReason: 'stop',
      },
    })
  })

  it('rejects malformed JSON', () => {
    expect(() => parseProviderProposal('{', allowedTools)).toThrow()
  })

  it('accepts the response-size boundary and rejects the next UTF-8 byte', () => {
    const envelope = JSON.stringify({ reply: 'Done', padding: '' })
    const atLimit = JSON.stringify({
      reply: 'Done',
      padding: 'x'.repeat(maxProviderResponseBytes - envelope.length),
    })

    expect(new TextEncoder().encode(atLimit)).toHaveLength(maxProviderResponseBytes)
    expect(parseProviderProposal(atLimit, allowedTools).reply).toBe('Done')
    expect(() => parseProviderProposal(`${atLimit} `, allowedTools)).toThrow(
      /response.*size/i,
    )
  })

  it.each([null, [], 'proposal'])(
    'rejects a non-object proposal root',
    (root) => {
      expect(() =>
        parseProviderProposal(JSON.stringify(root), allowedTools),
      ).toThrow()
    },
  )

  it.each(['', ' '.repeat(3), 'x'.repeat(8001)])(
    'rejects an empty or oversized reply',
    (reply) => {
      expect(() =>
        parseProviderProposal(JSON.stringify({ reply }), allowedTools),
      ).toThrow()
    },
  )

  it('rejects an unknown tool', () => {
    expect(() =>
      parseProviderProposal(
        JSON.stringify({
          reply: 'Done',
          toolCalls: [{ name: 'delete_everything', arguments: {} }],
        }),
        allowedTools,
      ),
    ).toThrow()
  })

  it('rejects more than two tool calls', () => {
    expect(() =>
      parseProviderProposal(
        JSON.stringify({
          reply: 'Done',
          toolCalls: [
            { name: 'open_note', arguments: {} },
            { name: 'open_note', arguments: {} },
            { name: 'open_note', arguments: {} },
          ],
        }),
        allowedTools,
      ),
    ).toThrow()
  })

  it('rejects non-array toolCalls', () => {
    expect(() =>
      parseProviderProposal(
        JSON.stringify({ reply: 'Done', toolCalls: {} }),
        allowedTools,
      ),
    ).toThrow()
  })

  it('rejects array tool arguments', () => {
    expect(() =>
      parseProviderProposal(
        JSON.stringify({
          reply: 'Done',
          toolCalls: [{ name: 'open_note', arguments: [] }],
        }),
        allowedTools,
      ),
    ).toThrow()
  })

  it.each([
    { label: 'oversized', arguments: { text: 'x'.repeat(16_385) } },
    { label: 'too deeply nested', arguments: nestedObject(9) },
  ])('rejects $label tool arguments', ({ arguments: argumentsValue }) => {
    expect(() =>
      parseProviderProposal(
        JSON.stringify({
          reply: 'Done',
          toolCalls: [{ name: 'open_note', arguments: argumentsValue }],
        }),
        allowedTools,
      ),
    ).toThrow()
  })

  it('rejects invalid tool records even when unknown top-level fields are safe', () => {
    expect(() =>
      parseProviderProposal(
        JSON.stringify({
          reply: 'Done',
          toolCalls: [{ name: 'open_note' }],
          harmlessExtra: true,
        }),
        allowedTools,
      ),
    ).toThrow()
  })

  it('normalizes a missing notch presentation to null', () => {
    expect(
      parseProviderProposal(JSON.stringify({ reply: 'Done' }), allowedTools),
    ).toEqual({ reply: 'Done', toolCalls: [], notchPresentation: null })
  })

  it.each(['title', 'body'] as const)(
    'rejects oversized notch presentation %s',
    (field) => {
      expect(() =>
        parseProviderProposal(
          JSON.stringify({
            reply: 'Done',
            notchPresentation: {
              kind: 'reply',
              title: field === 'title' ? 'x'.repeat(241) : 'Done',
              body: field === 'body' ? 'x'.repeat(241) : 'Done',
            },
          }),
          allowedTools,
        ),
      ).toThrow()
    },
  )

  it('rejects an invalid notch presentation kind', () => {
    expect(() =>
      parseProviderProposal(
        JSON.stringify({
          reply: 'Done',
          notchPresentation: { kind: 'animation', title: 'Done', body: 'Done' },
        }),
        allowedTools,
      ),
    ).toThrow()
  })

  it.each([
    { label: 'non-array', uiBlocks: {} },
    { label: 'malformed record', uiBlocks: [{ kind: 'note', data: [] }] },
    {
      label: 'too many records',
      uiBlocks: Array.from({ length: 9 }, () => ({ kind: 'note', data: {} })),
    },
    {
      label: 'oversized data',
      uiBlocks: [{ kind: 'note', data: { text: 'x'.repeat(16_385) } }],
    },
    {
      label: 'too deeply nested data',
      uiBlocks: [{ kind: 'note', data: nestedObject(9) }],
    },
  ])('rejects $label uiBlocks', ({ uiBlocks }) => {
    expect(() =>
      parseProviderProposal(
        JSON.stringify({ reply: 'Done', uiBlocks }),
        allowedTools,
      ),
    ).toThrow()
  })

  it('rejects oversized provider metadata', () => {
    expect(() =>
      parseProviderProposal(
        JSON.stringify({
          reply: 'Done',
          providerMetadata: { model: 'x'.repeat(241) },
        }),
        allowedTools,
      ),
    ).toThrow()
  })

  it('exposes the complete normalized request and pipeline contracts', () => {
    expect(requestContract.allowedTools[0]?.inputSchema).toEqual({
      type: 'object',
      properties: {},
    })
    expect(pipelineStages.gathering_context).toBe(true)
    expectTypeOf(requestContract).toMatchTypeOf<AiProviderRequest>()
    expectTypeOf(parseProviderProposal).returns.toMatchTypeOf<AiProviderProposal>()
  })
})

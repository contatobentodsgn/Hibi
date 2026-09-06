import type {
  AiProviderMetadata,
  AiProviderProposal,
  AiStructuredUiBlock,
  AiToolCall,
} from './contracts'

const MAX_REPLY_LENGTH = 8_000
const MAX_PROVIDER_RESPONSE_BYTES = 64 * 1024
const MAX_TOOL_CALLS = 2
const MAX_NOTCH_TEXT_LENGTH = 240
const NOTCH_KINDS = new Set(['reply', 'question', 'status'])
const MAX_UI_BLOCKS = 8
const MAX_DIAGNOSTIC_TEXT_LENGTH = 240
const MAX_NESTED_PAYLOAD_BYTES = 16_384
const MAX_NESTING_DEPTH = 8

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function assertBoundedPayload(value: Record<string, unknown>, label: string): void {
  const pending: Array<{ value: unknown; depth: number }> = [
    { value, depth: 0 },
  ]

  while (pending.length > 0) {
    const current = pending.pop()
    if (!current) break
    if (current.depth > MAX_NESTING_DEPTH) {
      throw new Error(`${label} exceeds maximum nesting depth`)
    }
    if (typeof current.value !== 'object' || current.value === null) continue

    const children = Array.isArray(current.value)
      ? current.value
      : Object.values(current.value)
    for (const child of children) {
      if (typeof child === 'object' && child !== null) {
        pending.push({ value: child, depth: current.depth + 1 })
      }
    }
  }

  const serialized = JSON.stringify(value)
  if (new TextEncoder().encode(serialized).byteLength > MAX_NESTED_PAYLOAD_BYTES) {
    throw new Error(`${label} exceeds serialized size limit`)
  }
}

function parseToolCalls(
  value: unknown,
  allowedTools: ReadonlySet<string>,
): AiToolCall[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > MAX_TOOL_CALLS) {
    throw new Error('toolCalls must be an array with at most 2 entries')
  }

  return value.map((call) => {
    if (!isPlainObject(call)) throw new Error('Each tool call must be an object')

    const { name, arguments: argumentsValue } = call
    if (typeof name !== 'string' || !allowedTools.has(name)) {
      throw new Error('Tool call name is not allowed')
    }
    if (!isPlainObject(argumentsValue)) {
      throw new Error('Tool call arguments must be a plain object')
    }
    assertBoundedPayload(argumentsValue, 'Tool call arguments')

    return { name, arguments: argumentsValue }
  })
}

function parseNotchPresentation(
  value: unknown,
): AiProviderProposal['notchPresentation'] {
  if (value === undefined || value === null) return null
  if (!isPlainObject(value)) {
    throw new Error('notchPresentation must be null or an object')
  }

  const { kind, title, body } = value
  if (typeof kind !== 'string' || !NOTCH_KINDS.has(kind)) {
    throw new Error('notchPresentation kind is invalid')
  }
  if (typeof title !== 'string' || title.length > MAX_NOTCH_TEXT_LENGTH) {
    throw new Error('notchPresentation title must be no longer than 240 characters')
  }
  if (typeof body !== 'string' || body.length > MAX_NOTCH_TEXT_LENGTH) {
    throw new Error('notchPresentation body must be no longer than 240 characters')
  }

  return { kind: kind as 'reply' | 'question' | 'status', title, body }
}

function parseUiBlocks(value: unknown): AiStructuredUiBlock[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > MAX_UI_BLOCKS) {
    throw new Error('uiBlocks must be an array with at most 8 entries')
  }

  return value.map((block) => {
    if (!isPlainObject(block)) throw new Error('Each UI block must be an object')
    if (typeof block.kind !== 'string' || block.kind.trim().length === 0) {
      throw new Error('UI block kind must be a non-empty string')
    }
    if (!isPlainObject(block.data)) throw new Error('UI block data must be a plain object')
    assertBoundedPayload(block.data, 'UI block data')
    return { kind: block.kind, data: block.data }
  })
}

function parseProviderMetadata(value: unknown): AiProviderMetadata | undefined {
  if (value === undefined) return undefined
  if (!isPlainObject(value)) throw new Error('providerMetadata must be an object')

  const metadata: AiProviderMetadata = {}
  for (const key of ['requestId', 'model', 'finishReason'] as const) {
    const field = value[key]
    if (field === undefined) continue
    if (typeof field !== 'string' || field.length > MAX_DIAGNOSTIC_TEXT_LENGTH) {
      throw new Error(`providerMetadata ${key} must be a bounded string`)
    }
    metadata[key] = field
  }
  return metadata
}

export function parseProviderProposal(
  raw: string,
  allowedTools: ReadonlySet<string>,
): AiProviderProposal {
  if (new TextEncoder().encode(raw).byteLength > MAX_PROVIDER_RESPONSE_BYTES) {
    throw new Error('Provider response exceeds serialized size limit')
  }

  const value: unknown = JSON.parse(raw)
  if (!isPlainObject(value)) throw new Error('Provider proposal must be an object')

  const { reply } = value
  if (
    typeof reply !== 'string' ||
    reply.trim().length === 0 ||
    reply.length > MAX_REPLY_LENGTH
  ) {
    throw new Error('reply must be non-empty and no longer than 8000 characters')
  }

  const proposal: AiProviderProposal = {
    reply,
    toolCalls: parseToolCalls(value.toolCalls, allowedTools),
    notchPresentation: parseNotchPresentation(value.notchPresentation),
  }
  const uiBlocks = parseUiBlocks(value.uiBlocks)
  if (uiBlocks !== undefined) proposal.uiBlocks = uiBlocks
  const providerMetadata = parseProviderMetadata(value.providerMetadata)
  if (providerMetadata !== undefined) proposal.providerMetadata = providerMetadata

  return proposal
}

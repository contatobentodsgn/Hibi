export type AiAuditType = 'turn.received' | 'tool.requested' | 'confirmation.requested' | 'confirmation.confirmed' | 'confirmation.cancelled' | 'tool.completed' | 'failed'

export type AiAuditEvent = Readonly<{
  type: AiAuditType
  requestId: string
  at: string
  provider?: string
  model?: string
  tools?: readonly string[]
  summary: string
}>

const MAX_ENTRIES = 200
const AUDIT_TYPES = new Set<AiAuditType>(['turn.received', 'tool.requested', 'confirmation.requested', 'confirmation.confirmed', 'confirmation.cancelled', 'tool.completed', 'failed'])
const safe = (value: string, maximum = 400) => value.replace(/(?:Bearer\s+|sk-)[^\s,;]+/gi, '[redacted]').replace(/(?:api[_-]?key|token)\s*[:=]\s*[^\s,;]+/gi, '[redacted]').slice(0, maximum)
const text = (value: unknown, maximum?: number) => typeof value === 'string' && value.trim() ? safe(value, maximum) : undefined
const object = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined

export function sanitizeAiAuditEvent(value: unknown): AiAuditEvent | undefined {
  const event = object(value)
  if (!event || typeof event.type !== 'string' || !AUDIT_TYPES.has(event.type as AiAuditType)) return undefined
  const requestId = text(event.requestId, 120)
  const at = typeof event.at === 'string' && !Number.isNaN(Date.parse(event.at)) ? event.at : undefined
  const summary = text(event.summary)
  if (!requestId || !at || !summary) return undefined
  const provider = text(event.provider, 240)
  const model = text(event.model, 240)
  const tools = Array.isArray(event.tools) ? event.tools.map((tool) => text(tool, 120)).filter((tool): tool is string => Boolean(tool)).slice(0, 2) : undefined
  return { type: event.type as AiAuditType, requestId, at, summary, ...(provider ? { provider } : {}), ...(model ? { model } : {}), ...(tools?.length ? { tools } : {}) }
}

export function loadAiAuditHistory(serialized: string | null, maximum = MAX_ENTRIES): AiAuditEvent[] {
  try {
    const parsed: unknown = JSON.parse(serialized ?? '[]')
    return Array.isArray(parsed) ? parsed.map(sanitizeAiAuditEvent).filter((event): event is AiAuditEvent => Boolean(event)).slice(0, maximum) : []
  } catch { return [] }
}

export function appendAiAuditEvent(entries: readonly AiAuditEvent[], event: unknown, maximum = MAX_ENTRIES): AiAuditEvent[] {
  const sanitized = sanitizeAiAuditEvent(event)
  const existing = entries.map(sanitizeAiAuditEvent).filter((entry): entry is AiAuditEvent => Boolean(entry))
  return (sanitized ? [sanitized, ...existing] : existing).slice(0, maximum)
}

export class AiHistory {
  private values: AiAuditEvent[] = []
  constructor(private readonly maximum = MAX_ENTRIES) {}

  record(event: AiAuditEvent): void {
    this.values = appendAiAuditEvent(this.values, event, this.maximum)
  }
  clear(): void { this.values = [] }
  entries(): readonly AiAuditEvent[] { return this.values.map((entry) => ({ ...entry, ...(entry.tools ? { tools: [...entry.tools] } : {}) })) }
}
